import type { PartyStateDynamic } from '@/models'

// Set 2 of OWNERS-PORT-MAP.md reads the owners release's card, item, market and event fields
// here, so it never edits set 1's wire files (partyApi.ts, models/state.ts). Each reader takes
// the merged party state as the release sends it; a field the fork console never sends reads as
// absent.

type Loose = Record<string, unknown>
const loose = (value: unknown): Loose => (value && typeof value === 'object' ? (value as Loose) : {})

/** runtime/status/api.ts CardLine: the card's activity line, which coordinator/line.ts computes. */
export interface CardLine {
  text: string
  task: string
  phase: string
  // "Stuck - trying <rung>" while the character's climber reports a stuck notice.
  notice?: string
  incident?: string
  // Each enabled add-on's line under this one, with the add-on's name.
  addons?: { addon: string; label: string }[]
}

/** `characterDetails[name].activity`. undefined means a console without the field (the fork
 *  console builds the line on the phone instead); null means the release sent no line. */
export function cardLine(details: unknown): CardLine | null | undefined {
  const source = loose(details)
  if (!('activity' in source)) return undefined
  const line = loose(source.activity)
  if (typeof line.text !== 'string') return null
  const addons = Array.isArray(line.addons)
    ? line.addons.filter((entry): entry is { addon: string; label: string } => typeof loose(entry).addon === 'string' && typeof loose(entry).label === 'string')
    : undefined
  return {
    text: line.text,
    task: String(line.task ?? ''),
    phase: String(line.phase ?? ''),
    ...(typeof line.notice === 'string' && line.notice ? { notice: line.notice } : {}),
    ...(typeof line.incident === 'string' ? { incident: line.incident } : {}),
    ...(addons?.length ? { addons } : {}),
  }
}

/** runtime/tasks/rules.ts HandControl and HAND_CONTROL_DEFAULT. */
export interface HandControl {
  on: boolean
  usePotions: boolean
  combat: boolean
  party: 'follows-me' | 'carries-on'
}
export const HAND_CONTROL_DEFAULT: HandControl = { on: false, usePotions: true, combat: true, party: 'follows-me' }

/** Config `handControlByCharacter[name]` over the default (hand-control.tsx HandControlToggle). */
export function handControl(state: PartyStateDynamic, name: string): HandControl {
  return { ...HAND_CONTROL_DEFAULT, ...(loose(loose((state as unknown as Loose).handControlByCharacter)[name]) as Partial<HandControl>) }
}

/** hand-control.tsx toggleWord: a character in a game client (a native slot) gets "Manual"; a
 *  headless one gets "Pause", and the console runs no code for it while Pause is on. */
export function handControlWord(state: PartyStateDynamic, name: string): 'Manual' | 'Pause' {
  return state.activeSlots?.find((slot) => slot.character === name)?.kind === 'native' ? 'Manual' : 'Pause'
}

/** The formation body connected-character-card.tsx onHandChange sends: only the changed keys. */
export function handControlBody(character: string, patch: Partial<HandControl>): { character: string; handControl: Partial<HandControl> } {
  return { character, handControl: patch }
}

/** Core `standSlots`: the items owner's stand count, whose `free` is the stand less the unpaused
 *  listings and the slot-reserving bids (stand-capacity.ts). */
export interface StandSlots {
  slots: number
  used: number
  free: number
}
export function standSlots(state: PartyStateDynamic): StandSlots | null {
  const value = loose((state as unknown as Loose).standSlots)
  return typeof value.slots === 'number' && typeof value.used === 'number' && typeof value.free === 'number' ? (value as unknown as StandSlots) : null
}
/** stand-capacity.ts standIsFull. Before the first core answer nothing is full; the fork console's
 *  state, which has no `standSlots`, keeps the phone's own count. */
export function standFull(state: PartyStateDynamic, ownCount: () => boolean): boolean {
  const slots = standSlots(state)
  return slots ? slots.free <= 0 : ownCount()
}

/** runtime/events/rules.ts EventListRow: each member's open occurrence with its state. */
export interface EventListRow {
  member: string
  event: string
  state: 'waiting' | 'attending' | 'left' | 'limit' | 'refused'
  reason: string | null
  rejoin: boolean
}
type AttendanceRecords = Record<string, Record<string, { ended?: boolean; ignored?: string; attending?: boolean } | undefined> | undefined>
/** runtime/events/rules.ts eventListRows. Only an occurrence left by a manual move offers Rejoin. */
export function eventListRows(attendance: AttendanceRecords | null | undefined): EventListRow[] {
  return Object.entries(attendance ?? {}).flatMap(([member, records]) =>
    Object.entries(records ?? {})
      .filter(([, entry]) => entry && !entry.ended)
      .map(([event, entry]) => {
        const reason = entry!.ignored ?? null
        const state: EventListRow['state'] =
          reason === 'manual travel' ? 'left' : reason === 'death limit' || reason === 'time limit' ? 'limit' : reason ? 'refused' : entry!.attending ? 'attending' : 'waiting'
        return { member, event, state, reason, rejoin: state === 'left' }
      }),
  )
}
/** event-selection-control.tsx: the member's own skip shows, and its source's (the leader whose
 *  events it uses) unless the source left by a manual move. */
export function eventSkip(rows: EventListRow[], member: string, source: string, event: string): { reason: string | null; rejoin: boolean } {
  const own = rows.find((row) => row.member === member && row.event === event && row.reason)
  const shown = own ?? rows.find((row) => row.member === source && row.event === event && row.reason && !row.rejoin)
  return { reason: shown?.reason ?? null, rejoin: !!own?.rejoin }
}
/** The body event-selection-control.tsx `rejoin` posts to `/event-rejoin`. */
export function eventRejoinBody(character: string, event: string): { character: string; event: string } {
  return { character, event }
}

/** runtime/events/coordinator/occurrences.ts TrickOrTreatCounts, on the trickortreat schedule's
 *  `trickOrTreat.characters[name]`. */
export interface TrickOrTreatCounts {
  day: string
  observedAt: number
  characterRemaining: number
  characterLimit: number
  accountRemainingUpperBound: number
  accountLimit: number
}
export function trickOrTreatCounts(schedule: unknown, name: string): TrickOrTreatCounts | undefined {
  const counts = loose(loose(loose(schedule).trickOrTreat).characters)[name]
  return counts && typeof counts === 'object' ? (counts as TrickOrTreatCounts) : undefined
}
/** event-selection-control.tsx knock line. A stale schedule shows only the limits. */
export function knocksLabel(counts: TrickOrTreatCounts | undefined, stale: boolean): string {
  const fresh = counts && !stale ? counts : undefined
  const account = fresh ? `${fresh.accountRemainingUpperBound > 0 ? 'up to ' : ''}${fresh.accountRemainingUpperBound}` : '—'
  return `Knocks left · Character: ${fresh?.characterRemaining ?? '—'}/${counts?.characterLimit ?? '—'} · Account: ${account}/${counts?.accountLimit ?? '—'}`
}
/** event-selection-control.tsx dailyResetLabel: the next 00:00 UTC on the server's clock. */
export function dailyResetLabel(now: number, clockOffsetMs = 0): string {
  const serverNow = now + clockOffsetMs
  const next = (Math.floor(serverNow / 86400000) + 1) * 86400000
  const seconds = Math.floor((next - serverNow) / 1000)
  const local = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(next)
  return `${local} (${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s)`
}

/** The owners release: its config always carries `handControlByCharacter` and its core
 *  `standSlots`, and neither the fork console nor Ryan's v1.4.0 sends either. */
export function ownersRelease(state: PartyStateDynamic): boolean {
  return 'handControlByCharacter' in state || !!standSlots(state)
}

/** The Cave view's `reopenable` point ids (hunting/coordinator/cave.ts snapshot): done merchant
 *  rooms of the party's own run. A console without the field reopens any done merchant room. */
export function caveReopenable(view: unknown, point: { id: string; done?: boolean; room?: string }): boolean {
  const ids = loose(view).reopenable
  if (Array.isArray(ids)) return ids.includes(point.id)
  return !!point.done && !!point.room && /^\d+:shop$/.test(point.room)
}
