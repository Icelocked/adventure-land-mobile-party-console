// Types for detect.mjs (used by the PWA's unit tests).
type Core = {
  bankbois?: { name: string }[]
  activeSlots?: { character?: string | null }[]
  characterDetails?: Record<string, { seenAt?: number }>
  characterConnections?: { name: string; status: string }[]
}
type Entry = { at: number; message?: string; level?: string; type?: string; details?: Record<string, unknown> | string }
type Settings = {
  stuckMinutes: number
  idleMinutes: number
  errors: { count: number; minutes: number }
  deaths: { count: number; minutes: number }
  rare: { mode: 'chance' | 'value' | 'both'; chanceOneIn: number; minGold: number }
}
type Position = { map?: string; x?: number; y?: number }
type Device = { alerts?: string[]; muted?: string[]; quiet?: { start: string; end: string; offsetMinutes?: number } | null }
type RareInfo = { name: string; gold: number; chance: number | null }
export const ALERTS: string[]
export const URGENT_ALERTS: string[]
export const DEFAULT_SETTINGS: Settings
export function mergeSettings(current: Partial<Settings>, patch?: unknown): Settings
export function liveCharacters(core: Core): string[]
export function characterProblems(core: Core, now: number, stuckAfterMs: number): Record<string, string>
export function problemTransitions(previous: Record<string, string>, current: Record<string, string>): { name: string; problem: string | null }[]
export function isGameLogError(message: string): boolean
export function isAlertableGameLogError(message: string): boolean
export function isAlertableActivityError(entry: Entry): boolean
export function errorTimes(gameLogs: Record<string, Entry[]>, merchantActivity: Entry[], merchantName: string | null): Record<string, number[]>
export function deathTimes(combatLogs: Record<string, Entry[]>): Record<string, number[]>
export function bursts(times: Record<string, number[]>, now: number, count: number, windowMs: number, lastAlertAt?: Record<string, number>): Record<string, number>
export function activityTimes(previous: Record<string, number>, combatLogs: Record<string, Entry[]> | null, gameLogs: Record<string, Entry[]> | null, positions: Record<string, Position> | null, previousPositions: Record<string, Position> | null, now: number): Record<string, number>
export function idleCharacters(activity: Record<string, number>, names: string[], merchantName: string | null, now: number, idleMs: number): string[]
export function completedRules(previous: Record<string, unknown>, config: Record<string, unknown>): { kind: string; title: string; body: string }[]
export function finishedUpgradeOrders(previousQueue: unknown[], queue: unknown[]): { title: string; body: string }[]
export function selectedEventIds(config: Record<string, unknown>): Set<string>
export function endedEvents(previous: { id: string; name?: string; live?: boolean }[], schedules: { id: string; live?: boolean }[], selected: Set<string>): { id: string; name?: string }[]
export function rareIndex(allItems: unknown[]): Record<string, RareInfo>
export function isRareDrop(info: RareInfo | undefined, rare: Settings['rare']): boolean
export function tradeNotice(entry: Entry): { title: string; body: string } | null
export function trackedOrders(core: Record<string, unknown>): { id: string; order?: { buys: Record<string, unknown>[] } }[]
export function tradeDigest(notices: { title: string; body: string }[]): { title: string; body: string } | null
export function latestError(gameLogs: Record<string, Entry[]>, merchantActivity: Entry[], merchantName: string | null, name: string): string
export function newEntries<T extends { at: number }>(entries: T[], since: number): T[]
export function newMail<T extends { id?: string | number }>(messages: T[], seenIds: Set<string>): T[]
export function inQuietHours(quiet: Device['quiet'], date: Date): boolean
export function fullInventories(inventory: Record<string, { items?: unknown[] }> | null | undefined, fast: Record<string, { inventorySize?: number }> | null | undefined, names: string[]): string[]
export function bankFreeSlots(bank: { packs?: Record<string, unknown[]> } | null | undefined): number | null
export function newlyAdded(previous: string[], current: string[]): string[]
export function recipients<T extends Device>(devices: T[], alert: string, character: string | undefined, date: Date): T[]
