import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM module without types
import { createUpdates, newer, parseVersion } from '../../notifier/updates.mjs'
// @ts-expect-error plain ESM module without types
import { ownConfig } from '../../updater/agent.mjs'

type Handle = (req: { method: string }, path: string, body: Record<string, unknown>) => Promise<[number, Record<string, unknown>] | null>

const release = (tag: string, extra: Record<string, unknown> = {}) => async () =>
  new Response(JSON.stringify({ tag_name: tag, draft: false, prerelease: false, ...extra }), { status: 200, headers: { etag: '"1"' } })

function setup(current: string, fetchImpl = release('v1.1.0'), withAgent = true, base = '') {
  const dir = mkdtempSync(join(tmpdir(), 'pwa-updates-'))
  if (withAgent) writeFileSync(join(dir, 'agent.json'), JSON.stringify({ at: Date.now(), phase: 'idle' }))
  const updates = createUpdates({ dir, current, base, fetchImpl, log: () => {} })
  const handle = updates.handle as Handle
  return { dir, updates, get: () => handle({ method: 'GET' }, '/update', {}), post: (path: string, body = {}) => handle({ method: 'POST' }, path, body) }
}

describe('versions', () => {
  it('compares stable semantic versions only', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3])
    expect(parseVersion('1.2')).toBeNull()
    expect(parseVersion('1.2.3-beta')).toBeNull()
    expect(newer('1.10.0', '1.9.9')).toBe(true)
    expect(newer('1.0.0', '1.0.0')).toBe(false)
    expect(newer('0.9.0', '1.0.0')).toBe(false)
    // An unversioned install is never told an arbitrary release is newer.
    expect(newer('1.0.0', '')).toBe(false)
  })
})

describe('notifier update routes', () => {
  it('reports an available release after a check', async () => {
    const { post } = setup('1.0.0')
    const [status, body] = (await post('/update/check'))!
    expect(status).toBe(200)
    expect(body).toMatchObject({ current: '1.0.0', available: '1.1.0', managed: true, phase: 'available' })
    expect(body.notes).toContain('/releases/tag/v1.1.0')
  })

  it('ignores prereleases and is up to date on the latest version', async () => {
    const beta = setup('1.0.0', release('v1.1.0', { prerelease: true }))
    expect((await beta.post('/update/check'))![1]).toMatchObject({ available: undefined, error: expect.stringContaining('stable') })
    const same = setup('1.1.0')
    expect((await same.post('/update/check'))![1]).toMatchObject({ available: undefined, phase: 'idle' })
  })

  it('install writes a request that names no version', async () => {
    const { dir, post } = setup('1.0.0')
    await post('/update/check')
    expect((await post('/update/install'))![0]).toBe(200)
    expect(JSON.parse(readFileSync(join(dir, 'request.json'), 'utf8'))).toEqual({ action: 'install', at: expect.any(Number) })
  })

  it('refuses installs without the updater or on a source build', async () => {
    const noAgent = setup('1.0.0', release('v1.1.0'), false)
    await noAgent.post('/update/check')
    expect((await noAgent.post('/update/install'))![0]).toBe(409)
    expect((await noAgent.get())![1]).toMatchObject({ managed: false, updater: false })
    const source = setup('')
    await source.post('/update/check')
    expect((await source.post('/update/install'))![0]).toBe(409)
    expect((await source.get())![1]).toMatchObject({ current: 'development build', managed: false, development: true })
  })

  it('a source build compares releases with the version it was built from', async () => {
    // Failure mode: an unversioned dev build announced the old 0.7.1 release as new.
    const older = setup('', release('v0.7.1'), false, '1.0.0')
    expect((await older.post('/update/check'))![1]).toMatchObject({ current: '1.0.0-dev', development: true, available: undefined, managed: false })
    const newer = setup('', release('v1.1.0'), false, '1.0.0')
    expect((await newer.post('/update/check'))![1]).toMatchObject({ current: '1.0.0-dev', available: '1.1.0', managed: false })
    expect((await newer.post('/update/install'))![0]).toBe(409)
  })

  it('automatic updates request an install as soon as one is available', async () => {
    const { dir, post } = setup('1.0.0')
    expect((await post('/update/preferences', { automatic: 'yes' }))![0]).toBe(400)
    await post('/update/preferences', { automatic: true })
    expect(existsSync(join(dir, 'request.json'))).toBe(false)
    await post('/update/check')
    expect(existsSync(join(dir, 'request.json'))).toBe(true)
  })

  it('keeps the last known release when GitHub fails', async () => {
    let fail = false
    const { post } = setup('1.0.0', async () => (fail ? new Response('', { status: 502 }) : release('v1.1.0')()))
    await post('/update/check')
    fail = true
    expect((await post('/update/check'))![1]).toMatchObject({ available: '1.1.0', error: expect.stringContaining('502') })
  })
})

describe('updater container config', () => {
  it('drops what the old image provided so the new image applies', () => {
    const image = { Config: { Env: ['PWA_VERSION=1.0.0', 'PATH=/bin'], Labels: { 'org.opencontainers.image.version': '1.0.0' }, Cmd: ['nginx'] } }
    const container = {
      Config: {
        Image: 'ghcr.io/icelocked/party-console-pwa:latest',
        Hostname: 'abc',
        Env: ['PWA_VERSION=1.0.0', 'PATH=/bin', 'CONSOLE_URL=http://party-console:3010'],
        Labels: { 'org.opencontainers.image.version': '1.0.0', 'com.docker.compose.service': 'party-console-pwa' },
        Cmd: ['nginx'],
      },
    }
    expect(ownConfig(container, image)).toEqual({
      Env: ['CONSOLE_URL=http://party-console:3010'],
      Labels: { 'com.docker.compose.service': 'party-console-pwa' },
    })
  })
})
