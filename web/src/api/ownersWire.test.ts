import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PartyApiClient, settingsRefusalNotice } from './partyApi'
import { connectLive, type LiveEvent } from './liveConnection'
import { serverClockOffset, watchdogMs } from './liveProtocol'

// The owners release's wire, as OWNERS-PORT-MAP.md rows A1, A3, A4, A8 and A23 list it.

type Answer = { status?: number; body?: string; headers?: Record<string, string> }
function stubFetch(answer: Answer) {
  const calls: { url: string; init?: RequestInit }[] = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return new Response(answer.status === 304 ? null : (answer.body ?? '{}'), { status: answer.status ?? 200, headers: answer.headers })
  })
  return calls
}
afterEach(() => vi.unstubAllGlobals())

describe('section revisions (A4)', () => {
  const api = new PartyApiClient({ baseUrl: 'http://console' })
  it('reads the ETag as the next revision', async () => {
    const calls = stubFetch({ body: '{"bank":{}}', headers: { ETag: '"r7"' } })
    const result = await api.getSection('state?catalog=0&dashboard=1&section=bank', null)
    expect(calls[0].url).toBe('http://console/party-api/state?catalog=0&dashboard=1&section=bank')
    expect(result).toEqual({ kind: 'success', value: { bank: {} }, revision: 'r7' })
  })
  it('sends the revision it holds and answers unchanged on a 304', async () => {
    const calls = stubFetch({ status: 304 })
    const result = await api.getSection('state?catalog=0&dashboard=1&section=bank', 'r7')
    expect(calls[0].url).toBe('http://console/party-api/state?catalog=0&dashboard=1&section=bank&revision=r7')
    expect(result).toEqual({ kind: 'unchanged' })
  })
})

describe('settings route (A8)', () => {
  const api = new PartyApiClient({ baseUrl: 'http://console' })
  it('posts the changes with the page basis, as settings-write.ts does', async () => {
    const calls = stubFetch({ body: '{"ok":true}' })
    await api.writeSettings([{ field: 'relocateIfCompeting', value: false }], 42)
    expect(calls[0].url).toBe('http://console/party-api/settings')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ changes: [{ field: 'relocateIfCompeting', value: false }], basis: 42 })
  })
  it('words an out-of-date refusal as the dashboard does', () => {
    expect(settingsRefusalNotice(409, { reason: 'out of date', field: 'homeRealm', character: 'Merch' }, 'x')).toBe(
      "homeRealm for Merch was not saved: the page was out of date, so it now shows the console's current value. Make the change again if you still want it.",
    )
    expect(settingsRefusalNotice(400, { error: 'bad' }, 'bad')).toBe('bad')
  })
})

describe('refusal text (A23)', () => {
  it("keeps a refusal's non-JSON text", async () => {
    stubFetch({ status: 502, body: 'Bad gateway from proxy' })
    const result = await new PartyApiClient({ baseUrl: '' }).post('escape', {})
    expect(result.kind === 'failure' && result.message).toBe('Bad gateway from proxy')
  })
})

describe('live protocol (A1, A3)', () => {
  it('fails after three heartbeats the stream names, else after 15 s', () => {
    expect(watchdogMs(5000)).toBe(15_000)
    expect(watchdogMs(2000)).toBe(6000)
    expect(watchdogMs(undefined)).toBe(15_000)
  })
  it("measures the server clock from a heartbeat's `at`", () => {
    expect(serverClockOffset({ type: 'heartbeat', epoch: 'e', sequence: 1, at: 10_500 }, 10_000)).toBe(500)
    expect(serverClockOffset({ type: 'delta', epoch: 'e', sequence: 1 }, 10_000)).toBeNull()
  })
})

class FakeEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2
  static opened: FakeEventSource[] = []
  readyState = 1
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  constructor() {
    FakeEventSource.opened.push(this)
  }
  close() {
    this.readyState = 2
  }
  send(message: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

describe('live connection (A3)', () => {
  beforeEach(() => {
    FakeEventSource.opened = []
    vi.stubGlobal('EventSource', FakeEventSource)
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it("fails after three of the stream's heartbeats and reconnects only when a core poll answers", () => {
    const events: LiveEvent[] = []
    const live = connectLive({ baseUrl: '' }, (event) => events.push(event))
    const source = FakeEventSource.opened[0]
    source.send({ type: 'snapshot', epoch: 'e', sequence: 1, characters: {}, heartbeatMs: 2000 })
    vi.advanceTimersByTime(7100)
    expect(events.at(-1)).toMatchObject({ kind: 'connectionHealth', healthy: false })
    vi.advanceTimersByTime(10_000)
    expect(FakeEventSource.opened).toHaveLength(1)
    live.coreAnswered()
    expect(FakeEventSource.opened).toHaveLength(2)
    live.close()
  })

  it('reports the server clock from each heartbeat', () => {
    const events: LiveEvent[] = []
    const live = connectLive({ baseUrl: '' }, (event) => events.push(event))
    const source = FakeEventSource.opened[0]
    source.send({ type: 'snapshot', epoch: 'e', sequence: 1, characters: {} })
    source.send({ type: 'heartbeat', epoch: 'e', sequence: 1, at: Date.now() + 3000, heartbeatMs: 5000 })
    expect(events.find((event) => event.kind === 'serverClock')).toEqual({ kind: 'serverClock', offset: 3000 })
    live.close()
  })
})
