import { LiveReceiver, type LiveMessage, type LiveRecordWire } from './liveProtocol'
import { streamUrl, type ServerSettings } from '@/config/serverConfig'

/** A character updated (record === null means it went offline), or the
 *  connection's health changed. */
export type LiveEvent =
  | { kind: 'characterUpdated'; name: string; record: LiveRecordWire | null }
  | { kind: 'connectionHealth'; healthy: boolean; error?: string }

const HEARTBEAT_TIMEOUT_MS = 15_000
const RECONNECT_DELAY_MS = 1_000
const WATCHDOG_TICK_MS = 1_000

/**
 * Connects to the `/party-api/dashboard-stream` SSE feed and calls
 * [onEvent] per update. Returns a function that closes the connection.
 *
 * A reconnect starts either on a stream error/bad frame, or from a 1s
 * watchdog that catches a stalled socket that stopped sending heartbeats
 * without erroring (EventSource's own auto-reconnect only reacts to
 * errors). Both go through `scheduleReconnect`, guarded by
 * `reconnectPending` so they never schedule overlapping reconnects.
 *
 * EventSource's `onerror` exposes no status or message, so connection
 * failure messages are necessarily vague.
 */
export function connectLive(settings: ServerSettings, onEvent: (event: LiveEvent) => void): () => void {
  const receiver = new LiveReceiver((name, record) => onEvent({ kind: 'characterUpdated', name, record }))
  let lastHeartbeat = Date.now()
  let reconnectPending = false
  let stopped = false
  let currentSource: EventSource | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let watchdogTimer: ReturnType<typeof setInterval> | undefined

  const reportHealth = (healthy: boolean, error?: string) => onEvent({ kind: 'connectionHealth', healthy, error })

  const scheduleReconnect = () => {
    if (stopped || reconnectPending) return
    reconnectPending = true
    reconnectTimer = setTimeout(() => {
      reconnectPending = false
      if (!stopped) startConnection()
    }, RECONNECT_DELAY_MS)
  }

  const startConnection = () => {
    if (stopped) return
    lastHeartbeat = Date.now()
    const source = new EventSource(streamUrl(settings))
    currentSource = source

    source.onopen = () => {
      lastHeartbeat = Date.now()
    }

    source.onmessage = (event) => {
      if (stopped) return
      let message: LiveMessage | null = null
      try {
        message = JSON.parse(event.data) as LiveMessage
      } catch {
        message = null
      }
      if (message == null) {
        // After a malformed frame the epoch/sequence state can't be
        // trusted, so start over.
        source.close()
        reportHealth(false, 'Received a malformed message from the server')
        scheduleReconnect()
        return
      }
      if (!receiver.accept(message)) return
      // Any accepted message, deltas included, proves the connection is
      // alive; otherwise a busy stream would trip the watchdog.
      lastHeartbeat = Date.now()
      if (message.type === 'snapshot') reportHealth(true)
    }

    source.onerror = () => {
      if (stopped) return
      source.close()
      reportHealth(false, describeReadyState(source.readyState))
      scheduleReconnect()
    }
  }

  reportHealth(false)
  startConnection()

  watchdogTimer = setInterval(() => {
    if (stopped) return
    const silentFor = Date.now() - lastHeartbeat
    if (silentFor > HEARTBEAT_TIMEOUT_MS) {
      currentSource?.close()
      reportHealth(false, `No response from the server for over ${HEARTBEAT_TIMEOUT_MS / 1000}s`)
      scheduleReconnect()
    }
  }, WATCHDOG_TICK_MS)

  return () => {
    stopped = true
    currentSource?.close()
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (watchdogTimer) clearInterval(watchdogTimer)
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
