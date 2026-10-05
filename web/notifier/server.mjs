// Push notifier for the Party Console PWA. Runs inside the PWA container next
// to nginx (which proxies /notify/ here), watches the user's own party-console
// through the same API a paired browser uses, and sends Web Push to the
// phones that enabled notifications. Not part of party-console itself.
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import webpush from 'web-push'
import { createUpdates } from './updates.mjs'
import {
  ALERTS,
  DEFAULT_SETTINGS,
  bankFreeSlots,
  fullInventories,
  newlyAdded,
  activityTimes,
  bursts,
  characterProblems,
  completedRules,
  deathTimes,
  endedEvents,
  errorTimes,
  finishedUpgradeOrders,
  idleCharacters,
  isRareDrop,
  liveCharacters,
  mergeSettings,
  newEntries,
  newMail,
  problemTransitions,
  rareIndex,
  recipients,
  selectedEventIds,
  tradeNotice,
  tradeDigest,
  latestError,
  trackedOrders,
} from './detect.mjs'

const PORT = Number(process.env.NOTIFIER_PORT || 3090)
const CONSOLE_URL = (process.env.CONSOLE_URL || 'http://party-console:3010').replace(/\/+$/, '')
const DATA_DIR = process.env.NOTIFIER_DATA || '/data/notifier'
const POLL_MS = Number(process.env.POLL_MS || 15_000)

mkdirSync(DATA_DIR, { recursive: true })
const file = (name) => join(DATA_DIR, name)
const load = (name, fallback) => {
  try {
    return JSON.parse(readFileSync(file(name), 'utf8'))
  } catch {
    return fallback
  }
}
// Owner-only: subscriptions hold each device's console pairing credential.
const save = (name, value) => {
  writeFileSync(file(name) + '.tmp', JSON.stringify(value, null, 2), { mode: 0o600 })
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

/** Older records chose two categories; map them onto the per-alert switches. */
function migrate(device) {
  if (device.alerts) return device
  const alerts = []
  if ((device.categories || []).includes('characters')) alerts.push('stuck')
  if ((device.categories || []).includes('merchant')) alerts.push('trading', 'mail')
  const { categories: _categories, ...rest } = device
  return { ...rest, alerts, quiet: null, muted: [] }
}
/** { endpoint: { subscription, alerts, quiet, muted, cookie, subject, createdAt } } */
const devices = Object.fromEntries(Object.entries(load('subscriptions.json', {})).map(([endpoint, device]) => [endpoint, migrate(device)]))
let settings = mergeSettings(load('settings.json', DEFAULT_SETTINGS))
const watch = {
  problems: {},
  merchantSince: null,
  combatSince: null,
  mailSeen: null,
  credentialFailed: false,
  activity: {},
  positions: {},
  idleAlerted: [],
  deathAlertAt: {},
  errorAlertAt: {},
  rules: null,
  queue: null,
  schedules: null,
  fullBags: [],
  bankFull: false,
  ...load('watch.json', {}),
}
let liveNames = []
let catalog = { revision: null, index: null }
const persist = () => {
  save('subscriptions.json', devices)
  save('watch.json', watch)
  save('settings.json', settings)
}

async function sendTo(device, notice) {
  try {
    webpush.setVapidDetails(device.subject, vapid.publicKey, vapid.privateKey)
    await webpush.sendNotification(device.subscription, JSON.stringify(notice), { TTL: 3600 })
  } catch (error) {
    // 404/410: the browser dropped this subscription.
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      delete devices[device.subscription.endpoint]
      persist()
      log('removed expired subscription')
    } else log('push failed', error?.statusCode || '', error?.body || error?.message || error)
  }
}
/** Push one alert to every device that wants it now. */
async function push(alert, notice, character) {
  const targets = recipients(Object.values(devices), alert, character, new Date())
  if (targets.length) log(`push ${alert} to ${targets.length}: ${notice.title}`)
  for (const device of targets) await sendTo(device, notice)
}

/** The newest stored browser credential; the watcher reads the console with it. */
function credential() {
  const entries = Object.values(devices).sort((a, b) => b.createdAt - a.createdAt)
  return entries[0]?.cookie
}

async function consoleGet(path, cookie) {
  const response = await fetch(CONSOLE_URL + path, { headers: cookie ? { cookie } : {}, redirect: 'manual', signal: AbortSignal.timeout(30_000) })
  if ((response.status >= 300 && response.status < 400) || response.status === 401 || response.status === 403) throw Object.assign(new Error('not paired'), { auth: true })
  if (!response.ok) throw new Error('HTTP ' + response.status)
  return response.json()
}
const section = (name, cookie) => consoleGet(`/party-api/state?catalog=0&dashboard=1&section=${name}`, cookie)

async function credentialProblem() {
  if (watch.credentialFailed) return
  watch.credentialFailed = true
  persist()
  for (const device of Object.values(devices)) await sendTo(device, { title: 'Notifications paused', body: 'Open Party Console and enable notifications again to reconnect.', tag: 'notifier-credential', url: '/settings' })
}
const characterUrl = (name) => `/characters/${encodeURIComponent(name)}`
const wants = (alert) => Object.values(devices).some((device) => (device.alerts || []).includes(alert))

async function checkCore(cookie, positions) {
  const core = await section('core', cookie)
  const now = Number(core.serverNow) || Date.now()
  const names = liveCharacters(core)
  liveNames = names
  // Stuck or offline.
  const problems = characterProblems(core, now, settings.stuckMinutes * 60_000)
  for (const event of problemTransitions(watch.problems, problems))
    await push(
      'stuck',
      event.problem
        ? { title: `${event.name}: ${event.problem.startsWith('No update') ? 'not reporting' : event.problem}`, body: event.problem, tag: `character-${event.name}`, url: characterUrl(event.name) }
        : { title: `${event.name} is reporting again`, body: 'Back to normal.', tag: `character-${event.name}`, url: characterUrl(event.name) },
      event.name,
    )
  watch.problems = problems
  // Buy-and-upgrade orders that left the merchant queue.
  const queue = trackedOrders(core)
  if (watch.queue) for (const order of finishedUpgradeOrders(watch.queue, queue)) await push('orders', { ...order, tag: `order-${order.body}`, url: '/' })
  watch.queue = queue
  // Events that ended.
  if (watch.schedules && watch.selectedEvents)
    for (const event of endedEvents(watch.schedules, core.eventSchedules || [], new Set(watch.selectedEvents))) await push('events', { title: `${event.name || event.id} ended`, body: 'The event is over.', tag: `event-${event.id}`, url: '/' })
  watch.schedules = (core.eventSchedules || []).map((event) => ({ id: event.id, name: event.name, live: !!event.live }))
  // No actions (activity is refreshed from logs and positions).
  watch.activity = activityTimes(watch.activity, null, null, positions, watch.positions, now)
  watch.positions = positions
  const idle = idleCharacters(watch.activity, names.filter((name) => !problems[name]), watch.merchant, now, settings.idleMinutes * 60_000)
  for (const name of idle)
    if (!watch.idleAlerted.includes(name)) await push('idle', { title: `${name}: no actions`, body: `Nothing done for ${settings.idleMinutes}+ minutes.`, tag: `idle-${name}`, url: characterUrl(name) }, name)
  watch.idleAlerted = idle
  if (core.referenceRevision && core.referenceRevision !== catalog.revision && wants('rare')) await loadCatalog(cookie, core.referenceRevision)
  return now
}

async function loadCatalog(cookie, revision) {
  const result = await section('catalog', cookie)
  catalog = { revision, index: rareIndex(result.merchantCatalog?.allItems || []) }
  log('catalog loaded for rare drops')
}

async function checkLogs(cookie, now) {
  const logs = await section('logs', cookie)
  const combatLogs = logs.combatLogs || {}
  const gameLogs = logs.gameLogs || {}
  const activity = logs.merchantActivity || []
  watch.activity = activityTimes(watch.activity, combatLogs, gameLogs, null, null, now)
  // Trading notices from the merchant activity log; the first read only marks where history ends.
  const latest = Math.max(0, ...activity.map((entry) => Number(entry.at) || 0))
  if (watch.merchantSince === null) watch.merchantSince = latest
  const trades = newEntries(activity, watch.merchantSince).map(tradeNotice).filter(Boolean)
  const digest = tradeDigest(trades)
  if (digest) await push('trading', { ...digest, tag: `trade-${latest}`, url: '/' })
  watch.merchantSince = Math.max(watch.merchantSince, latest)
  // Rare drops from new loot entries.
  const combatEntries = Object.entries(combatLogs).flatMap(([name, entries]) => (entries || []).map((entry) => ({ ...entry, name })))
  const latestCombat = Math.max(0, ...combatEntries.map((entry) => Number(entry.at) || 0))
  if (watch.combatSince === null) watch.combatSince = latestCombat
  if (catalog.index)
    for (const entry of newEntries(combatEntries, watch.combatSince)) {
      if (entry.type !== 'loot') continue
      const item = entry.details?.item
      const info = catalog.index[item]
      if (isRareDrop(info, settings.rare))
        await push('rare', { title: `Rare drop: ${info.name}`, body: `${entry.name} looted ${entry.details?.quantity || 1} × ${info.name}`, tag: `rare-${entry.name}-${entry.at}`, url: characterUrl(entry.name) }, entry.name)
    }
  watch.combatSince = Math.max(watch.combatSince, latestCombat)
  // Repeated deaths.
  const deaths = bursts(deathTimes(combatLogs), now, settings.deaths.count, settings.deaths.minutes * 60_000, watch.deathAlertAt)
  for (const [name, count] of Object.entries(deaths)) {
    watch.deathAlertAt[name] = now
    await push('deaths', { title: `${name} keeps dying`, body: `${count} deaths in the last ${settings.deaths.minutes} minutes.`, tag: `deaths-${name}`, url: characterUrl(name) }, name)
  }
  // Error bursts.
  const errors = bursts(errorTimes(gameLogs, activity, watch.merchant), now, settings.errors.count, settings.errors.minutes * 60_000, watch.errorAlertAt)
  for (const [name, count] of Object.entries(errors)) {
    watch.errorAlertAt[name] = now
    const last = latestError(gameLogs, activity, watch.merchant, name)
    log('errors', name, count, last ? `latest: ${last}` : '')
    await push('errors', { title: `${name}: repeated errors`, body: `${count} errors in the last ${settings.errors.minutes} minutes.${last ? ` Latest: ${last}` : ''}`, tag: `errors-${name}`, url: name === watch.merchant ? '/' : characterUrl(name) }, name)
  }
}

async function checkConfig(cookie) {
  const config = await section('config', cookie)
  watch.merchant = config.merchantCharacter || null
  const rules = { autoUpgradeMarks: config.autoUpgradeMarks || {}, autoCompounds: config.autoCompounds || {} }
  if (watch.rules) for (const done of completedRules(watch.rules, rules)) await push('rules', { title: done.title, body: done.body, tag: `rule-${done.body}`, url: '/' })
  watch.rules = rules
  watch.selectedEvents = [...selectedEventIds(config)]
}

/** Inventory full (each time a bag fills up) and bank full (each time the
 *  last free bank slot goes). */
async function checkStorage(cookie, fast, withBank) {
  if (wants('inventory')) {
    const inventory = await section('inventory', cookie)
    const full = fullInventories(inventory.characters, fast.characters, liveNames)
    for (const name of newlyAdded(watch.fullBags, full))
      await push('inventory', { title: `${name}: inventory full`, body: 'No free bag slots left.', tag: `inventory-${name}`, url: characterUrl(name) }, name)
    watch.fullBags = full
  }
  if (withBank && wants('bank')) {
    const bank = await consoleGet('/party-api/state?section=bank&dashboard=1', cookie)
    const free = bankFreeSlots(bank.bank)
    if (free !== null) {
      if (free === 0 && !watch.bankFull) await push('bank', { title: 'Bank full', body: 'Every unlocked bank pack is out of free slots.', tag: 'bank-full', url: '/bank' })
      watch.bankFull = free === 0
    }
  }
}

async function checkMail(cookie) {
  const mail = await consoleGet('/party-api/mail', cookie)
  const messages = mail.messages || []
  if (watch.mailSeen === null) watch.mailSeen = messages.map((message) => String(message.id))
  const seen = new Set(watch.mailSeen)
  for (const message of newMail(messages, seen)) await push('mail', { title: `Mail from ${message.from || 'someone'}`, body: message.subject || '(No subject)', tag: `mail-${message.id}`, url: '/mail' })
  watch.mailSeen = messages.map((message) => String(message.id))
}

let tick = 0
async function poll() {
  tick++
  if (!Object.keys(devices).length) return
  const cookie = credential()
  try {
    if (tick === 1 || tick % 4 === 0) await checkConfig(cookie)
    const fast = await section('fast', cookie)
    const positions = Object.fromEntries(Object.entries(fast.characters || {}).map(([name, value]) => [name, { map: value.map, x: value.x, y: value.y }]))
    const now = await checkCore(cookie, positions)
    if (tick % 2 === 0) await checkLogs(cookie, now)
    if (tick % 2 === 0) await checkStorage(cookie, fast, tick % 4 === 0)
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
  const cookie = partyCookie(req.headers.cookie)
  if (!cookie) return false // no console request for unpaired callers
  try {
    await consoleGet('/party-api/escape', cookie)
    return true
  } catch {
    return false
  }
}
const cleanAlerts = (value) => (Array.isArray(value) ? value.filter((alert) => ALERTS.includes(alert)) : null)
const cleanQuiet = (value) =>
  value && /^\d{1,2}:\d{2}$/.test(String(value.start)) && /^\d{1,2}:\d{2}$/.test(String(value.end))
    ? { start: String(value.start), end: String(value.end), offsetMinutes: Math.max(-900, Math.min(900, Number(value.offsetMinutes) || 0)) }
    : null
const cleanMuted = (value) => (Array.isArray(value) ? value.map(String).slice(0, 50) : [])
/** Only the console's pairing cookie, never the rest of the browser's cookies. */
const partyCookie = (header) => {
  const value = /(?:^|;\s*)party=([^;]+)/.exec(String(header || ''))?.[1]
  return value ? `party=${value}` : ''
}
/** Mutations must come from this app's own pages (the pairing cookie is
 *  SameSite=Strict too; this is the second lock, as the PWA can be public). */
const sameOrigin = (req) => {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}
const MAX_DEVICES = 50
const status = (device) => (device ? { subscribed: true, alerts: device.alerts, quiet: device.quiet, muted: device.muted, paused: watch.credentialFailed } : { subscribed: false })

const updates = createUpdates({ log: (...args) => log(...args) })
updates.start()

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://notifier')
    const path = url.pathname.replace(/^\/notify/, '')
    if (req.method === 'GET' && path === '/config') return send(res, 200, { publicKey: vapid.publicKey, alerts: ALERTS })
    if (req.method === 'POST' && !sameOrigin(req)) return send(res, 403, { error: 'Cross-site request refused' })
    if (!(await authorized(req))) return send(res, 401, { error: 'Pair this browser with Party Console first.' })
    const body = req.method === 'POST' ? await readBody(req) : {}
    const routed = await updates.handle(req, path, body)
    if (routed) return send(res, ...routed)
    const endpoint = String(body.subscription?.endpoint || body.endpoint || url.searchParams.get('endpoint') || '')
    if (req.method === 'GET' && path === '/status') return send(res, 200, status(devices[endpoint]))
    if (req.method === 'GET' && path === '/settings') return send(res, 200, settings)
    if (req.method === 'POST' && path === '/settings') {
      settings = mergeSettings(settings, body)
      persist()
      return send(res, 200, settings)
    }
    if (req.method === 'POST' && path === '/subscribe') {
      if (!body.subscription?.endpoint || !body.subscription?.keys) return send(res, 400, { error: 'Invalid subscription' })
      const origin = String(req.headers.origin || '')
      devices[endpoint] = {
        subscription: body.subscription,
        alerts: cleanAlerts(body.alerts) ?? [...ALERTS],
        quiet: cleanQuiet(body.quiet),
        muted: cleanMuted(body.muted),
        cookie: partyCookie(req.headers.cookie),
        subject: /^https:\/\//.test(origin) ? origin : 'mailto:party-console@localhost',
        createdAt: Date.now(),
      }
      // Bound the store: drop the oldest subscriptions past the limit.
      const ordered = Object.entries(devices).sort(([, a], [, b]) => a.createdAt - b.createdAt)
      for (const [old] of ordered.slice(0, Math.max(0, ordered.length - MAX_DEVICES))) delete devices[old]
      watch.credentialFailed = false
      persist()
      return send(res, 200, status(devices[endpoint]))
    }
    if (req.method === 'POST' && path === '/prefs') {
      const device = devices[endpoint]
      if (!device) return send(res, 404, { error: 'Not subscribed' })
      if ('alerts' in body) device.alerts = cleanAlerts(body.alerts) ?? device.alerts
      if ('quiet' in body) device.quiet = cleanQuiet(body.quiet)
      if ('muted' in body) device.muted = cleanMuted(body.muted)
      persist()
      return send(res, 200, status(device))
    }
    if (req.method === 'POST' && path === '/unsubscribe') {
      delete devices[endpoint]
      persist()
      return send(res, 200, { subscribed: false })
    }
    if (req.method === 'POST' && path === '/test') {
      const device = devices[endpoint]
      if (!device) return send(res, 404, { error: 'Not subscribed' })
      webpush.setVapidDetails(device.subject, vapid.publicKey, vapid.privateKey)
      await webpush.sendNotification(device.subscription, JSON.stringify({ title: 'Party Console', body: 'Notifications are working.', tag: 'notifier-test', url: '/settings' }), { TTL: 600 })
      return send(res, 200, { sent: true })
    }
    return send(res, 404, { error: 'Not found' })
  } catch (error) {
    log('request failed', error?.message || error)
    return send(res, 500, { error: error?.body || error?.message || 'Notifier error' })
  }
}).listen(PORT, '127.0.0.1', () => log(`listening on 127.0.0.1:${PORT}, watching ${CONSOLE_URL}`))

if (!existsSync(file('subscriptions.json'))) persist()
