// Push notifier for the Party Console PWA. Runs inside the PWA container next
// to nginx (which proxies /notify/ here), watches the user's own party-console
// through the same API a paired browser uses, and sends Web Push to the
// phones that enabled notifications. Not part of party-console itself.
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import webpush from 'web-push'
import { characterProblems, merchantNotice, newEntries, newMail, problemTransitions } from './detect.mjs'

const PORT = Number(process.env.NOTIFIER_PORT || 3090)
const CONSOLE_URL = (process.env.CONSOLE_URL || 'http://party-console:3010').replace(/\/+$/, '')
const DATA_DIR = process.env.NOTIFIER_DATA || '/data/notifier'
const STUCK_AFTER_MS = Number(process.env.STUCK_AFTER_MS || 120_000)
const POLL_MS = Number(process.env.POLL_MS || 15_000)
const CATEGORIES = ['characters', 'merchant']

mkdirSync(DATA_DIR, { recursive: true })
const file = (name) => join(DATA_DIR, name)
const load = (name, fallback) => {
  try {
    return JSON.parse(readFileSync(file(name), 'utf8'))
  } catch {
    return fallback
  }
}
const save = (name, value) => {
  writeFileSync(file(name) + '.tmp', JSON.stringify(value, null, 2))
  renameSync(file(name) + '.tmp', file(name))
}
const log = (...args) => console.log(new Date().toISOString(), '[notifier]', ...args)

// VAPID keys are generated once and kept, or every subscription would break.
let vapid = load('vapid.json', null)
if (!vapid) {
  vapid = webpush.generateVAPIDKeys()
  save('vapid.json', vapid)
  log('generated VAPID keys')
}

/** { endpoint: { subscription, categories, cookie, subject, createdAt } } */
let subscriptions = load('subscriptions.json', {})
const watch = load('watch.json', { problems: {}, merchantSince: null, mailSeen: null, credentialFailed: false })
const persist = () => {
  save('subscriptions.json', subscriptions)
  save('watch.json', watch)
}

async function push(categories, notice) {
  const targets = Object.values(subscriptions).filter((entry) => categories.some((category) => entry.categories.includes(category)))
  for (const entry of targets) {
    try {
      webpush.setVapidDetails(entry.subject, vapid.publicKey, vapid.privateKey)
      await webpush.sendNotification(entry.subscription, JSON.stringify(notice), { TTL: 3600 })
    } catch (error) {
      // 404/410: the browser dropped this subscription.
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        delete subscriptions[entry.subscription.endpoint]
        persist()
        log('removed expired subscription')
      } else log('push failed', error?.statusCode || '', error?.body || error?.message || error)
    }
  }
}

/** The newest stored browser credential; the watcher reads the console with it. */
function credential() {
  const entries = Object.values(subscriptions).filter((entry) => entry.cookie !== undefined)
  entries.sort((a, b) => b.createdAt - a.createdAt)
  return entries[0]?.cookie
}

async function consoleGet(path, cookie) {
  const response = await fetch(CONSOLE_URL + path, { headers: cookie ? { cookie } : {}, redirect: 'manual', signal: AbortSignal.timeout(20_000) })
  if (response.status >= 300 && response.status < 400) throw Object.assign(new Error('not paired'), { auth: true })
  if (response.status === 401 || response.status === 403) throw Object.assign(new Error('not paired'), { auth: true })
  if (!response.ok) throw new Error('HTTP ' + response.status)
  return response.json()
}

async function credentialProblem() {
  if (watch.credentialFailed) return
  watch.credentialFailed = true
  persist()
  await push(CATEGORIES, { title: 'Notifications paused', body: 'Open Party Console and enable notifications again to reconnect.', tag: 'notifier-credential', url: '/settings' })
}

async function checkCharacters(cookie) {
  const core = await consoleGet('/party-api/state?catalog=0&dashboard=1&section=core', cookie)
  const now = Number(core.serverNow) || Date.now()
  const problems = characterProblems(core, now, STUCK_AFTER_MS)
  for (const event of problemTransitions(watch.problems, problems)) {
    await push(['characters'], event.problem
      ? { title: `${event.name}: ${event.problem.startsWith('No update') ? 'not reporting' : event.problem}`, body: event.problem, tag: `character-${event.name}`, url: `/characters/${encodeURIComponent(event.name)}` }
      : { title: `${event.name} is reporting again`, body: 'Back to normal.', tag: `character-${event.name}`, url: `/characters/${encodeURIComponent(event.name)}` })
  }
  watch.problems = problems
}

async function checkMerchant(cookie) {
  const logs = await consoleGet('/party-api/state?catalog=0&dashboard=1&section=logs', cookie)
  const entries = logs.merchantActivity || []
  const latest = Math.max(0, ...entries.map((entry) => Number(entry.at) || 0))
  // The first read only records where history ends; old entries are never pushed.
  if (watch.merchantSince === null) watch.merchantSince = latest
  for (const entry of newEntries(entries, watch.merchantSince)) {
    const notice = merchantNotice(entry)
    if (notice) await push(['merchant'], { ...notice, tag: `merchant-${entry.at}`, url: '/' })
  }
  watch.merchantSince = Math.max(watch.merchantSince, latest)
}

async function checkMail(cookie) {
  const mail = await consoleGet('/party-api/mail', cookie)
  const messages = mail.messages || []
  if (watch.mailSeen === null) watch.mailSeen = messages.map((message) => String(message.id))
  const seen = new Set(watch.mailSeen)
  for (const message of newMail(messages, seen)) {
    await push(['merchant'], { title: `Mail from ${message.from || 'someone'}`, body: message.subject || '(No subject)', tag: `mail-${message.id}`, url: '/mail' })
  }
  watch.mailSeen = messages.map((message) => String(message.id))
}

let tick = 0
async function poll() {
  tick++
  if (!Object.keys(subscriptions).length) return
  const cookie = credential()
  try {
    await checkCharacters(cookie)
    if (tick % 2 === 0) await checkMerchant(cookie)
    if (tick % 4 === 0) await checkMail(cookie)
    if (watch.credentialFailed) watch.credentialFailed = false
    persist()
  } catch (error) {
    if (error?.auth) await credentialProblem()
    else log('poll failed', error?.message || error)
  }
}
setInterval(() => void poll(), POLL_MS)

// --- HTTP API (behind nginx at /notify/)
const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 64_000) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
const send = (res, status, value) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

/** Only browsers the console accepts may manage notifications: the request's
 *  own cookie must read the console. */
async function authorized(req) {
  try {
    await consoleGet('/party-api/escape', req.headers.cookie || '')
    return true
  } catch {
    return false
  }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://notifier')
    const path = url.pathname.replace(/^\/notify/, '')
    if (req.method === 'GET' && path === '/config') return send(res, 200, { publicKey: vapid.publicKey, categories: CATEGORIES })
    if (!(await authorized(req))) return send(res, 401, { error: 'Pair this browser with Party Console first.' })
    const body = req.method === 'POST' ? await readBody(req) : {}
    const endpoint = String(body.subscription?.endpoint || body.endpoint || url.searchParams.get('endpoint') || '')
    if (req.method === 'GET' && path === '/status') {
      const entry = subscriptions[endpoint]
      return send(res, 200, entry ? { subscribed: true, categories: entry.categories, paused: watch.credentialFailed } : { subscribed: false })
    }
    if (req.method === 'POST' && path === '/subscribe') {
      if (!body.subscription?.endpoint || !body.subscription?.keys) return send(res, 400, { error: 'Invalid subscription' })
      const categories = (Array.isArray(body.categories) ? body.categories : CATEGORIES).filter((category) => CATEGORIES.includes(category))
      const origin = String(req.headers.origin || '')
      subscriptions[endpoint] = {
        subscription: body.subscription,
        categories,
        cookie: req.headers.cookie || '',
        subject: /^https:\/\//.test(origin) ? origin : 'mailto:party-console@localhost',
        createdAt: Date.now(),
      }
      watch.credentialFailed = false
      persist()
      return send(res, 200, { subscribed: true, categories })
    }
    if (req.method === 'POST' && path === '/categories') {
      const entry = subscriptions[endpoint]
      if (!entry) return send(res, 404, { error: 'Not subscribed' })
      entry.categories = (Array.isArray(body.categories) ? body.categories : []).filter((category) => CATEGORIES.includes(category))
      persist()
      return send(res, 200, { subscribed: true, categories: entry.categories })
    }
    if (req.method === 'POST' && path === '/unsubscribe') {
      delete subscriptions[endpoint]
      persist()
      return send(res, 200, { subscribed: false })
    }
    if (req.method === 'POST' && path === '/test') {
      const entry = subscriptions[endpoint]
      if (!entry) return send(res, 404, { error: 'Not subscribed' })
      webpush.setVapidDetails(entry.subject, vapid.publicKey, vapid.privateKey)
      await webpush.sendNotification(entry.subscription, JSON.stringify({ title: 'Party Console', body: 'Notifications are working.', tag: 'notifier-test', url: '/settings' }), { TTL: 600 })
      return send(res, 200, { sent: true })
    }
    return send(res, 404, { error: 'Not found' })
  } catch (error) {
    log('request failed', error?.message || error)
    return send(res, 500, { error: error?.body || error?.message || 'Notifier error' })
  }
}).listen(PORT, '127.0.0.1', () => log(`listening on 127.0.0.1:${PORT}, watching ${CONSOLE_URL}`))

if (!existsSync(file('subscriptions.json'))) persist()
