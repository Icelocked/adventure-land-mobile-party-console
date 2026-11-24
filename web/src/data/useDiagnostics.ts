import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { markAlertsRead, parseReadMarks, type DiagnosticsAlert, type DiagnosticsRecordsReply, type DiagnosticsReport } from '@/models'
import { useDynamicState, usePartyApi } from './PartyDataProvider'

// The read marks are this device's, under the PWA's own key. The console's page keeps its own
// under `party-ui:diagnostics-read-alerts`, so a mark made there does not carry here.
export const DIAGNOSTICS_READ_KEY = 'party-console-companion:diagnostics-read-alerts'
const changed = 'party-diagnostics-read-changed'
function subscribe(listener: () => void) {
  window.addEventListener('storage', listener)
  window.addEventListener(changed, listener)
  return () => {
    window.removeEventListener('storage', listener)
    window.removeEventListener(changed, listener)
  }
}
function readRaw(): string | null {
  try {
    return localStorage.getItem(DIAGNOSTICS_READ_KEY)
  } catch {
    return null
  }
}

// The config poll's period. The alerts also reload on it, since the group and call snapshots send
// no save notice (diagnostics-dialog.tsx `useDiagnosticsAlerts`).
const ALERTS_POLL_MS = 15_000
const NO_ALERTS: DiagnosticsAlert[] = []

/** The alerts and their read marks. The list reloads when a ring saves a record (core
 *  `recordSaved`) and on the config poll's period. */
export function useDiagnosticsAlerts() {
  const api = usePartyApi()
  const savedAt = useDynamicState().recordSaved?.at ?? 0
  const query = useQuery({
    queryKey: ['diagnostics', 'alerts', savedAt],
    queryFn: async () => {
      const result = await api.getJsonReportingError<{ alerts: DiagnosticsAlert[] }>('diagnostics/alerts')
      if (result.kind === 'failure') throw new Error(result.message)
      return result.value.alerts ?? []
    },
    refetchInterval: ALERTS_POLL_MS,
    placeholderData: keepPreviousData,
    retry: false,
  })
  const alerts = query.data ?? NO_ALERTS
  const raw = useSyncExternalStore(subscribe, readRaw, () => null)
  const marks = useMemo(() => parseReadMarks(raw), [raw])
  const read = useMemo(() => new Set(marks), [marks])
  const markRead = useCallback(
    (ids: readonly string[]) => {
      try {
        localStorage.setItem(DIAGNOSTICS_READ_KEY, JSON.stringify(markAlertsRead(marks, ids, alerts)))
      } catch {
        // Storage unavailable: the marks stay as they were.
        return
      }
      window.dispatchEvent(new Event(changed))
    },
    [alerts, marks],
  )
  const unread = alerts.filter((alert) => !read.has(alert.id))
  return { alerts, read, unread, markRead, error: query.error ? query.error.message : '' }
}
export type DiagnosticsAlerts = ReturnType<typeof useDiagnosticsAlerts>

/** One alert's report, read once when it opens. */
export function useDiagnosticsReport(alert: DiagnosticsAlert) {
  const api = usePartyApi()
  return useQuery({
    queryKey: ['diagnostics', 'alert', alert.id],
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const result = await api.getJsonReportingError<DiagnosticsReport>(
        `diagnostics/alert?subject=${encodeURIComponent(alert.subject)}&id=${encodeURIComponent(alert.id)}`,
      )
      if (result.kind === 'failure') throw new Error(result.message)
      return result.value
    },
  })
}

/** One character's read of a ring. Each read starts or renews that character's lease on the ring. */
export async function readRing(api: ReturnType<typeof usePartyApi>, character: string, ring: string): Promise<DiagnosticsRecordsReply> {
  const result = await api.getJsonReportingError<DiagnosticsRecordsReply>(
    `diagnostics/records?character=${encodeURIComponent(character)}&rings=${encodeURIComponent(ring)}`,
  )
  if (result.kind === 'failure') throw new Error(result.message)
  return result.value
}
