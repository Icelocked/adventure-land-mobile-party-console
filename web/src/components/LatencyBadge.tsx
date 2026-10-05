import { useLatencyMs } from '@/data/PartyDataProvider'

/** Round-trip time for the party header, so a slow network can be told
 *  apart from a stuck app. Thresholds are a rough feel for a phone reaching
 *  a self-hosted server over Tailscale/guest wifi, not a formal SLA. */
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
