import { LiveReceiver, type LiveMessage, type LiveRecordWire } from './liveProtocol'
import { streamUrl, type ServerSettings } from '@/config/serverConfig'

/** What a consumer actually needs to know about the live connection -
 *  either a character updated (or went offline, record === null), or the
 *  connection's own health changed. Ports network/LiveConnection.kt's
 *  LiveEvent (itself matching dashboard-live.tsx's two observable pieces
 *  of state: per-character query data, and the shared healthy flag). */
export type LiveEvent =
  | { kind: 'characterUpdated'; name: string; record: LiveRecordWire | null }
  | { kind: 'connectionHealth'; healthy: boolean; error?: string }

const HEARTBEAT_TIMEOUT_MS = 15_000
const RECONNECT_DELAY_MS = 1_000
const WATCHDOG_TICK_MS = 1_000

/**
 * Connects to `{baseUrl}/party-api/dashboard-stream` (Server-Sent Events,
 * exactly what party-console's own web dashboard connects to) and calls
 * [onEvent] per update - a direct port of network/LiveConnection.kt's
 * `liveEvents` Flow, using the browser's native EventSource in place of
 * OkHttp's SSE client.
 *
 * Two independent triggers can start a reconnect, matching the Android
 * port exactly: an immediate one on any stream failure/bad frame, and a
 * 1-second watchdog tick that catches a connection which never errored
 * but also stopped sending heartbeats (a stalled-but-not-closed socket -
 * this is why EventSource's own built-in auto-reconnect isn't relied on
 * alone; it only fires on an actual `error` event, not on silence). Both
 * funnel through `scheduleReconnect`, guarded by `reconnectPending` so a
 * failure and a watchdog tick landing close together never schedule two
 * overlapping reconnects.
 *
 * Call the returned function to close the connection cleanly (e.g. on
 * unmount).
 *
 * Note: the browser's EventSource intentionally exposes NO detail on
 * `onerror` (no HTTP status, no message - a cross-origin/security
 * restriction, unlike OkHttp's onFailure which hands back the real
 * response/exception) - error messages here are necessarily vaguer than
 * the Android app's for connection failures specifically; the malformed-
 * message and heartbeat-timeout paths still carry full detail.
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
        // A single malformed frame: close and reconnect, since the
        // epoch/sequence state can no longer be trusted to be in sync
        // with the server.
        source.close()
        reportHealth(false, 'Received a malformed message from the server')
        scheduleReconnect()
        return
      }
      if (!receiver.accept(message)) return
      // Any accepted message proves the connection is alive - not just
      // heartbeat/snapshot types (a character actively sending delta
      // updates, the normal case during gameplay, must also reset the
      // watchdog, or it looks "silent" and forces a spurious reconnect).
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
