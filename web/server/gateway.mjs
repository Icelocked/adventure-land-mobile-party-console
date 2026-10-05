// The Windows package's web server: what nginx does in the Docker image
// (nginx.conf, nginx-locations.conf) in plain Node, so the package needs no
// other software. Serves the built app, proxies party-console on the same
// origin and the notifier under /notify/, and applies the same exposure
// hardening, since the PWA can be published through Tailscale Funnel.
import { createServer, request } from 'node:http'
import { connect } from 'node:net'
import { createReadStream, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { createGzip, constants as zlib } from 'node:zlib'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
}
const COMPRESSIBLE = /^(application\/(json|javascript|manifest\+json)|text\/(plain|css|html|event-stream)|image\/svg\+xml)/

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

// Hop-by-hop headers are never forwarded. x-party-tls is party-console's
// internal header between its own processes; a visitor must not set it.
const DROP_REQUEST = new Set(['connection', 'keep-alive', 'proxy-connection', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'x-party-tls'])
const DROP_RESPONSE = new Set(['connection', 'keep-alive', 'transfer-encoding', 'trailer', 'upgrade'])

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/** nginx's limit_req with burst and nodelay: a leaky bucket per client. */
export function rateLimiter({ rate, burst, now = Date.now }) {
  const buckets = new Map()
  const allow = (key) => {
    const at = now()
    const bucket = buckets.get(key)
    const excess = bucket ? Math.max(0, bucket.excess - ((at - bucket.at) / 1000) * rate) + 1 : 1
    // A rejected request isn't counted, as in nginx.
    if (excess > burst + 1) return false
    buckets.set(key, { excess, at })
    return true
  }
  const prune = () => {
    const cutoff = now() - 60_000
    for (const [key, bucket] of buckets) if (bucket.at < cutoff) buckets.delete(key)
  }
  return { allow, prune }
}

/** The visitor's address. Tailscale Serve and Funnel connect from this
 *  machine, so X-Forwarded-For is believed only from loopback peers. */
export function clientAddress(req) {
  const peer = req.socket.remoteAddress || ''
  if (!LOOPBACK.has(peer)) return peer
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map((part) => part.trim()).filter(Boolean)
  for (let i = forwarded.length - 1; i >= 0; i--) if (!LOOPBACK.has(forwarded[i])) return forwarded[i]
  return forwarded[0] || peer
}

/** Resolves a URL path inside root, or null if it would leave it. */
export function staticPath(root, urlPath) {
  let decoded
  try { decoded = decodeURIComponent(urlPath) } catch { return null }
  if (decoded.includes('\0')) return null
  const resolved = normalize(join(root, decoded))
  return resolved === root || resolved.startsWith(root.endsWith(sep) ? root : root + sep) ? resolved : null
}

function fileAt(path) {
  try {
    const stat = statSync(path)
    if (stat.isFile()) return { path, stat }
    if (stat.isDirectory()) return fileAt(join(path, 'index.html'))
  } catch { /* missing */ }
  return null
}

const wantsGzip = (req) => /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))

export function createGateway({ root, consoleUrl = 'http://127.0.0.1:3010', notifierUrl = 'http://127.0.0.1:3090', log = console.log } = {}) {
  const rootDir = normalize(root)
  const upstreams = { console: new URL(consoleUrl), notifier: new URL(notifierUrl) }
  const zones = { api: rateLimiter({ rate: 30, burst: 120 }), auth: rateLimiter({ rate: 2, burst: 20 }) }
  const prune = setInterval(() => { zones.api.prune(); zones.auth.prune() }, 60_000)
  prune.unref?.()
  const open = new Map()
  const CONNECTIONS = 60

  /** Which upstream and limits a path gets (nginx-locations.conf). */
  function route(path) {
    if (path.startsWith('/party-api/')) return { upstream: 'console', zone: 'api', timeout: 3600_000 }
    if (path.startsWith('/setup/')) return { upstream: 'console', zone: 'auth', timeout: 60_000 }
    if (path.startsWith('/console-update') || path.startsWith('/console-debug') || path.startsWith('/debug-assets/')) return { upstream: 'console', zone: 'api', timeout: 60_000 }
    if (path.startsWith('/debug-game/')) return { upstream: 'console', zone: 'api', timeout: 3600_000 }
    if (path.startsWith('/notify/')) return { upstream: 'notifier', zone: 'auth', timeout: 60_000, maxBody: 64 * 1024 }
    return null
  }

  function baseHeaders(req) {
    const headers = { ...SECURITY_HEADERS }
    if (/https/.test(String(req.headers['x-forwarded-proto'] || ''))) headers['Strict-Transport-Security'] = 'max-age=31536000'
    return headers
  }

  function fail(req, res, status, message) {
    if (res.headersSent) return void res.destroy()
    res.writeHead(status, { ...baseHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ error: message }))
  }

  /** Pipes body into res, gzipped when the client and type allow it. Event
   *  streams are flushed per chunk so events aren't held back. */
  function send(req, res, status, headers, body, type) {
    const gzip = req.method !== 'HEAD' && wantsGzip(req) && COMPRESSIBLE.test(type || '') && !headers['content-encoding'] && status !== 204 && status !== 304
    if (gzip) {
      delete headers['content-length']
      headers['content-encoding'] = 'gzip'
      headers.vary = headers.vary ? `${headers.vary}, Accept-Encoding` : 'Accept-Encoding'
    }
    res.writeHead(status, headers)
    if (req.method === 'HEAD') { body.resume?.(); return void res.end() }
    if (!gzip) return void body.pipe(res)
    const zip = createGzip({ level: 6 })
    if (/event-stream/.test(type)) body.on('data', () => setImmediate(() => zip.flush(zlib.Z_SYNC_FLUSH)))
    body.pipe(zip).pipe(res)
  }

  function serveStatic(req, res, path) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(req, res, 405, 'Method not allowed')
    const target = staticPath(rootDir, path)
    // SPA fallback: any path that isn't a file serves index.html.
    const found = (target && fileAt(target)) || fileAt(join(rootDir, 'index.html'))
    if (!found) return fail(req, res, 404, 'Not found')
    const type = TYPES[extname(found.path).toLowerCase()] || 'application/octet-stream'
    const etag = `"${found.stat.size.toString(16)}-${Math.floor(found.stat.mtimeMs).toString(16)}"`
    const headers = {
      ...baseHeaders(req),
      'content-type': type,
      etag,
      'last-modified': found.stat.mtime.toUTCString(),
      // Vite's hashed assets never change; everything else revalidates.
      'cache-control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    }
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return void res.end() }
    headers['content-length'] = String(found.stat.size)
    if (found.stat.size < 512) return send(req, res, 200, headers, createReadStream(found.path), '')
    send(req, res, 200, headers, createReadStream(found.path), type)
  }

  function forward(req, res, target, rule) {
    const declared = Number(req.headers['content-length'] || 0)
    const maxBody = rule.maxBody || 1024 * 1024
    if (declared > maxBody) return fail(req, res, 413, 'Request too large')
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([key]) => !DROP_REQUEST.has(key)))
    const upstream = request({ hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers }, (reply) => {
      const replyHeaders = Object.fromEntries(Object.entries(reply.headers).filter(([key]) => !DROP_RESPONSE.has(key)))
      for (const key of Object.keys(SECURITY_HEADERS)) delete replyHeaders[key.toLowerCase()]
      Object.assign(replyHeaders, baseHeaders(req))
      send(req, res, reply.statusCode || 502, replyHeaders, reply, String(reply.headers['content-type'] || ''))
    })
    upstream.setTimeout(rule.timeout, () => upstream.destroy(new Error('Upstream timed out')))
    upstream.on('error', () => fail(req, res, 502, 'party-console is not reachable; is it running?'))
    res.on('close', () => upstream.destroy())
    let received = 0
    req.on('data', (chunk) => {
      received += chunk.length
      if (received > maxBody) { upstream.destroy(); fail(req, res, 413, 'Request too large') }
    })
    req.pipe(upstream)
  }

  function admit(req) {
    const client = clientAddress(req)
    const count = open.get(client) || 0
    if (count >= CONNECTIONS) return null
    open.set(client, count + 1)
    let released = false
    return {
      client,
      release: () => {
        if (released) return
        released = true
        const left = (open.get(client) || 1) - 1
        if (left > 0) open.set(client, left)
        else open.delete(client)
      },
    }
  }

  const server = createServer((req, res) => {
    const slot = admit(req)
    if (!slot) return fail(req, res, 429, 'Too many connections')
    res.on('close', slot.release)
    let path
    try { path = new URL(req.url || '/', 'http://localhost').pathname } catch { return fail(req, res, 400, 'Bad request') }
    const rule = route(path)
    if (!rule) return serveStatic(req, res, path)
    if (!zones[rule.zone].allow(slot.client)) return fail(req, res, 429, 'Too many requests')
    forward(req, res, upstreams[rule.upstream], rule)
  })

  // The debug game viewer is a WebSocket (websockify) under /debug-game/.
  server.on('upgrade', (req, socket, head) => {
    const refuse = (status) => socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
    const path = String(req.url || '').split('?')[0]
    if (!path.startsWith('/debug-game/')) return refuse('404 Not Found')
    const slot = admit(req)
    if (!slot) return refuse('429 Too Many Requests')
    socket.on('close', slot.release)
    if (!zones.api.allow(slot.client)) return refuse('429 Too Many Requests')
    const target = upstreams.console
    const upstream = connect(Number(target.port || 80), target.hostname, () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`]
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const key = req.rawHeaders[i].toLowerCase()
        if (key !== 'x-party-tls') lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
      }
      upstream.write(lines.join('\r\n') + '\r\n\r\n')
      if (head?.length) upstream.write(head)
      upstream.pipe(socket).pipe(upstream)
    })
    upstream.setTimeout(3600_000, () => upstream.destroy())
    upstream.on('error', () => refuse('502 Bad Gateway'))
    socket.on('error', () => upstream.destroy())
    socket.on('close', () => upstream.destroy())
  })

  server.on('clientError', (_error, socket) => socket.destroy())
  server.on('close', () => clearInterval(prune))
  log(`serving ${rootDir}, console ${consoleUrl}`)
  return server
}
