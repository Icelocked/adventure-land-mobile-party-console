import type { Condition } from '@/models'

// status-duration.ts, verbatim.
export type StatusDuration = { observed: number; at: number; total: number; source: Condition['source'] }
export function durationSignature(conditions: Condition[]) {
  return JSON.stringify(conditions.map((condition) => [condition.id, condition.remainingMs, condition.source, condition.definition?.duration]))
}
export function reconcileDurations(signature: string, previous: Record<string, StatusDuration | undefined>, now: number) {
  const inputs: [string, number | null, Condition['source'], unknown][] = JSON.parse(signature)
  const next = Object.fromEntries(inputs.map(([id, remainingMs, source, duration]) => [id, observeStatus({ remainingMs: remainingMs ?? undefined, source, definition: { duration } }, previous[id], now)]))
  return Object.keys(previous).length === inputs.length && inputs.every(([id]) => next[id] === previous[id]) ? previous : next
}
export function observeStatus(condition: Pick<Condition, 'remainingMs' | 'source' | 'definition'>, previous: StatusDuration | undefined, now: number): StatusDuration | undefined {
  const remaining = condition.remainingMs
  if (typeof remaining !== 'number' || !Number.isFinite(remaining) || remaining < 0) return undefined
  const defined = Number(condition.definition?.duration)
  if (previous && previous.observed === remaining && previous.source === condition.source) {
    const total = Math.max(previous.total, Number.isFinite(defined) && defined > 0 ? defined : 0)
    return total === previous.total ? previous : { ...previous, total }
  }
  const refreshed = !previous || previous.source !== condition.source || remaining > previous.observed
  return {
    observed: remaining,
    at: now,
    source: condition.source,
    total: Math.max(remaining, Number.isFinite(defined) && defined > 0 ? defined : 0, refreshed ? 0 : previous!.total),
  }
}
export function statusRemaining(value: StatusDuration | undefined, now: number) {
  if (!value) return null
  return Math.max(0, value.observed - Math.max(0, now - value.at))
}

/** display-value.ts, verbatim. */
export function displayValue(value: unknown): string {
  if (value === null) return 'None'
  if (Array.isArray(value)) return value.map(displayValue).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return String(value)
  return value === undefined ? '' : 'Unsupported value'
}
