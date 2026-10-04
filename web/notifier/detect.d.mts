// Types for detect.mjs (used by the PWA's unit tests).
type Core = {
  bankbois?: { name: string }[]
  activeSlots?: { character?: string | null }[]
  characterDetails?: Record<string, { seenAt?: number }>
  characterConnections?: { name: string; status: string }[]
}
type Entry = { at: number; message?: string; level?: string }
export function liveCharacters(core: Core): string[]
export function characterProblems(core: Core, now: number, stuckAfterMs: number): Record<string, string>
export function problemTransitions(previous: Record<string, string>, current: Record<string, string>): { name: string; problem: string | null }[]
export function merchantNotice(entry: Entry): { title: string; body: string } | null
export function newEntries(entries: Entry[], since: number): Entry[]
export function newMail<T extends { id?: string | number }>(messages: T[], seenIds: Set<string>): T[]
