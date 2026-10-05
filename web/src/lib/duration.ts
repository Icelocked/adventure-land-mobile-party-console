import { useEffect, useState } from 'react'

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms)) return 'Unknown'
  if (ms <= 0) return '0s'
  if (ms < 1) return '<0.001s'
  const total = Math.round(ms)
  const hours = Math.floor(total / 3600000)
  const minutes = Math.floor((total % 3600000) / 60000)
  const seconds = (total % 60000) / 1000
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', seconds ? `${seconds}s` : ''].filter(Boolean).join(' ') || '0s'
}

export function durationLabel(ms?: number | null) {
  if (ms === null || ms === undefined) return 'Active'
  if (ms <= 0) return 'Expiring'
  return formatDurationMs(Math.ceil(ms / 1000) * 1000)
}

/** The current time, ticking every second. */
export function useClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}
