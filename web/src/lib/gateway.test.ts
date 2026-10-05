import { createServer, request, type IncomingMessage, type Server } from 'node:http'
import { connect, type AddressInfo } from 'node:net'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM module without types
import { clientAddress, createGateway, rateLimiter, staticPath } from '../../server/gateway.mjs'
// @ts-expect-error plain ESM module without types
import { assetName } from '../../server/supervisor.mjs'

const listen = (server: Server) => new Promise<number>((done) => server.listen(0, '127.0.0.1', () => done((server.address() as AddressInfo).port)))

type Reply = { status: number; headers: IncomingMessage['headers']; body: Buffer }
function get(port: number, path: string, headers: Record<string, string> = {}, method = 'GET', body?: Buffer): Promise<Reply> {
  return new Promise((done, failed) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => done({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', failed)
    req.end(body)
  })
}

let upstream: Server
let notifier: Server
let gateway: Server
let port: number
let deadPort: number
const seen: IncomingMessage['headers'][] = []

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'pwa-gateway-'))
  mkdirSync(join(root, 'assets'))
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>PWA</title>')
  writeFileSync(join(root, 'assets', 'app.js'), 'console.log("app");\n'.repeat(200))

  upstream = createServer((req, res) => {
    seen.push(req.headers)
    if (req.url === '/party-api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'x-frame-options': 'SAMEORIGIN' })
      res.write('data: first\n\n')
      setTimeout(() => res.end('data: last\n\n'), 1500)
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ url: req.url }))
  })
  upstream.on('upgrade', (req, socket) => {
    seen.push(req.headers)
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    socket.on('data', (data) => socket.write(data))
  })
  notifier = createServer((req, res) => {
    req.resume()
    req.on('end', () => res.end('{"ok":true}'))
  })
  const consolePort = await listen(upstream)
  const notifierPort = await listen(notifier)
  const dead = createServer()
  deadPort = await listen(dead)
  dead.close()
  gateway = createGateway({ root, consoleUrl: `http://127.0.0.1:${consolePort}`, notifierUrl: `http://127.0.0.1:${notifierPort}`, log: () => {} })
  port = await listen(gateway)
})

afterAll(() => {
  gateway.close()
  upstream.close()
  notifier.close()
})

describe('static files', () => {
  it('serves the app with security headers and an SPA fallback', async () => {
    const home = await get(port, '/')
    expect(home.status).toBe(200)
    expect(home.body.toString()).toContain('<title>PWA</title>')
    expect(home.headers['x-frame-options']).toBe('DENY')
    expect(home.headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(home.headers['cache-control']).toBe('no-cache')
    expect(home.headers['strict-transport-security']).toBeUndefined()
    expect((await get(port, '/bank/inventory')).body.toString()).toContain('<title>PWA</title>')
  })

  it('gzips hashed assets and lets browsers cache them', async () => {
    const asset = await get(port, '/assets/app.js', { 'accept-encoding': 'gzip' })
    expect(asset.headers['content-encoding']).toBe('gzip')
    expect(asset.headers['cache-control']).toContain('immutable')
    expect(gunzipSync(asset.body).toString()).toContain('console.log("app")')
    const again = await get(port, '/assets/app.js', { 'if-none-match': String(asset.headers.etag) })
    expect(again.status).toBe(304)
  })

  it('never serves files outside the app folder', async () => {
    expect(staticPath('/srv/app', '/../secret')).toBeNull()
    expect(staticPath('/srv/app', '/..%2f..%2fsecret')).toBeNull()
    const escaped = await get(port, '/..%2f..%2fpackage.json')
    expect(escaped.body.toString()).toContain('<title>PWA</title>')
  })

  it('sends HSTS only for HTTPS visitors', async () => {
    const secure = await get(port, '/', { 'x-forwarded-proto': 'https' })
    expect(secure.headers['strict-transport-security']).toBe('max-age=31536000')
  })
})

describe('proxy', () => {
  it('forwards console paths with the browser Host and without party-console internal headers', async () => {
    const reply = await get(port, '/party-api/state?x=1', { host: 'phone.example:8080', 'x-party-tls': 'guess' })
    expect(JSON.parse(reply.body.toString())).toEqual({ url: '/party-api/state?x=1' })
    const headers = seen.at(-1)!
    expect(headers.host).toBe('phone.example:8080')
    expect(headers['x-party-tls']).toBeUndefined()
  })

  it('streams events through gzip without holding them back, with its own security headers', async () => {
    const first = await new Promise<{ text: string; frame: string | undefined }>((done, failed) => {
      const req = request({ host: '127.0.0.1', port, path: '/party-api/stream', headers: { 'accept-encoding': 'gzip' } }, (res) => {
        let buffer = Buffer.alloc(0)
        res.on('data', (chunk: Buffer) => {
          buffer = Buffer.concat([buffer, chunk])
          try {
            const text = gunzipSync(buffer, { finishFlush: 2 }).toString()
            if (text.includes('first')) { done({ text, frame: res.headers['x-frame-options'] as string }); req.destroy() }
          } catch { /* wait for more */ }
        })
      })
      req.on('error', failed)
      req.end()
    })
    expect(first.text).toContain('data: first')
    expect(first.text).not.toContain('last')
    expect(first.frame).toBe('DENY')
  })

  it('forwards the notifier and limits its request size', async () => {
    expect((await get(port, '/notify/status')).body.toString()).toBe('{"ok":true}')
    const big = Buffer.alloc(70 * 1024, 'a')
    const refused = await get(port, '/notify/subscribe', { 'content-type': 'application/json', 'content-length': String(big.length) }, 'POST', big)
    expect(refused.status).toBe(413)
  })

  it('reports a console that is down', async () => {
    const down = createGateway({ root: tmpdir(), consoleUrl: `http://127.0.0.1:${deadPort}`, log: () => {} })
    const downPort = await listen(down)
    const reply = await get(downPort, '/party-api/state')
    down.close()
    expect(reply.status).toBe(502)
    expect(reply.headers['x-content-type-options']).toBe('nosniff')
  })

  it('passes the debug game WebSocket through', async () => {
    const echoed = await new Promise<string>((done, failed) => {
      const socket = connect(port, '127.0.0.1', () => {
        socket.write('GET /debug-game/websockify HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nX-Party-Tls: guess\r\n\r\n')
      })
      let text = ''
      socket.on('data', (data) => {
        text += data.toString()
        if (text.includes('101') && !text.includes('ping')) socket.write('ping')
        if (text.includes('ping')) { socket.destroy(); done(text) }
      })
      socket.on('error', failed)
    })
    expect(echoed).toContain('101 Switching Protocols')
    expect(seen.at(-1)!['x-party-tls']).toBeUndefined()
  })
})

describe('exposure limits', () => {
  it('limits the pairing endpoints per visitor', async () => {
    const statuses = []
    for (let i = 0; i < 30; i++) statuses.push((await get(port, '/setup/state', { 'x-forwarded-for': '203.0.113.9' })).status)
    expect(statuses.slice(0, 21).every((status) => status === 200)).toBe(true)
    expect(statuses.slice(21)).toContain(429)
    // Another visitor (as Tailscale Funnel reports it) has its own allowance.
    expect((await get(port, '/setup/state', { 'x-forwarded-for': '203.0.113.10' })).status).toBe(200)
  })

  it('leaks back as time passes, like nginx', () => {
    let now = 0
    const limit = rateLimiter({ rate: 2, burst: 1, now: () => now })
    expect([limit.allow('a'), limit.allow('a'), limit.allow('a')]).toEqual([true, true, false])
    now += 1000
    expect(limit.allow('a')).toBe(true)
  })

  it('believes X-Forwarded-For only from this machine', () => {
    const req = (peer: string, forwarded?: string) => ({ socket: { remoteAddress: peer }, headers: forwarded ? { 'x-forwarded-for': forwarded } : {} })
    expect(clientAddress(req('192.168.1.5', '203.0.113.9'))).toBe('192.168.1.5')
    expect(clientAddress(req('127.0.0.1', '203.0.113.9'))).toBe('203.0.113.9')
    expect(clientAddress(req('127.0.0.1', '10.0.0.1, 203.0.113.9'))).toBe('203.0.113.9')
    expect(clientAddress(req('127.0.0.1'))).toBe('127.0.0.1')
  })
})

describe('packages', () => {
  it('names one package per launcher', () => {
    expect(assetName('1.0.1', true)).toBe('party-console-companion-pwa-windows-v1.0.1.zip')
    expect(assetName('1.0.1', false)).toBe('party-console-companion-pwa-linux-v1.0.1.tar.gz')
  })
})
