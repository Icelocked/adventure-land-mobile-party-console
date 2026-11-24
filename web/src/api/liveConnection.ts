import { LiveReceiver, serverClockOffset, watchdogMs, type LiveMessage, type LiveRecordWire } from './liveProtocol'
import { streamUrl, type ServerSettings } from '@/config/serverConfig'

/** A character updated (record === null means it went offline), the
 *  connection's health changed, or a heartbeat measured the server clock. */
export type LiveEvent =
  | { kind: 'characterUpdated'; name: string; record: LiveRecordWire | null }
  | { kind: 'connectionHealth'; healthy: boolean; error?: string }
  | { kind: 'serverClock'; offset: number }

const WATCHDOG_TICK_MS = 1_000

export interface LiveConnection {
  close(): void
  /** The data layer calls this after each core poll that answered: a failed stream reconnects then. */
  coreAnswered(): void
}

/**
 * Connects to the `/party-api/dashboard-stream` SSE feed and calls
 * [onEvent] per update.
 *
 * The stream fails on an error, a bad frame, or silence past three of the
 * heartbeats it names (watchdogMs), as the dashboard's does
 * (dashboard-live.tsx). A failed stream waits for the coordinator to answer
 * the fallback core poll again, which runs while the stream is down, and
 * reconnects at the next `coreAnswered`.
 *
 * EventSource's `onerror` exposes no status or message, so connection
 * failure messages are necessarily vague.
 */
export function connectLive(settings: ServerSettings, onEvent: (event: LiveEvent) => void): LiveConnection {
  const receiver = new LiveReceiver((name, record) => onEvent({ kind: 'characterUpdated', name, record }))
  let lastHeartbeat = Date.now()
  let silenceLimit = watchdogMs(undefined)
  let waiting = false
  let stopped = false
  let currentSource: EventSource | null = null
  let watchdogTimer: ReturnType<typeof setInterval> | undefined

  const reportHealth = (healthy: boolean, error?: string) => onEvent({ kind: 'connectionHealth', healthy, error })

  const fail = (error: string) => {
    currentSource?.close()
    reportHealth(false, error)
    waiting = true
  }

  const startConnection = () => {
    if (stopped) return
    waiting = false
    lastHeartbeat = Date.now()
    const source = new EventSource(streamUrl(settings))
    currentSource = source

    source.onopen = () => {
      lastHeartbeat = Date.now()
    }

    source.onmessage = (event) => {
      if (stopped || source !== currentSource) return
      let message: LiveMessage | null = null
      try {
        message = JSON.parse(event.data) as LiveMessage
      } catch {
        message = null
      }
      if (message == null) {
        // After a malformed frame the epoch/sequence state can't be
        // trusted, so start over.
        fail('Received a malformed message from the server')
        return
      }
      if (!receiver.accept(message)) return
      // Any accepted message, deltas included, proves the connection is
      // alive; otherwise a busy stream would trip the watchdog.
      lastHeartbeat = Date.now()
      if (message.heartbeatMs) silenceLimit = watchdogMs(message.heartbeatMs)
      const offset = serverClockOffset(message, lastHeartbeat)
      if (offset !== null) onEvent({ kind: 'serverClock', offset })
      if (message.type === 'snapshot') reportHealth(true)
    }

    source.onerror = () => {
      if (stopped || source !== currentSource) return
      fail(describeReadyState(source.readyState))
    }
  }

  reportHealth(false)
  startConnection()

  watchdogTimer = setInterval(() => {
    if (stopped || waiting) return
    if (Date.now() - lastHeartbeat > silenceLimit) fail(`No response from the server for over ${Math.round(silenceLimit / 1000)}s`)
  }, WATCHDOG_TICK_MS)

  return {
    close() {
      stopped = true
      currentSource?.close()
      if (watchdogTimer) clearInterval(watchdogTimer)
    },
    coreAnswered() {
      if (waiting && !stopped) startConnection()
    },
  }
}

function describeReadyState(state: number): string {
  switch (state) {
    case EventSource.CONNECTING:
      return 'Connection failed while connecting (check the address and that the server is reachable)'
    case EventSource.CLOSED:
      return 'Connection closed unexpectedly'
    default:
      return 'Connection failed for an unknown reason'
  }
}
