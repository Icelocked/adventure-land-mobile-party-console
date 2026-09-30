import { useLatencyMs } from '@/data/PartyDataProvider'

/** A visible round-trip-time reading for the party header - added after a
 *  session where bad-network lag made it impossible to tell whether the
 *  app was even working ("is it stuck, or just slow?"). Thresholds are a
 *  rough feel for a phone poking a self-hosted server over Tailscale/
 *  guest wifi, not a formal SLA: comfortable, noticeable, and "expect real
 *  delay before anything you tap visibly reacts". */
export function LatencyBadge() {
  const latencyMs = useLatencyMs()
  if (latencyMs == null) return null

  const color = latencyMs < 300 ? 'text-emerald-500' : latencyMs < 1000 ? 'text-amber-500' : 'text-destructive'

  return (
    <span className={`font-mono text-xs ${color}`} title={`Last round trip to the server: ${latencyMs}ms`}>
      {latencyMs}ms
    </span>
  )
}
