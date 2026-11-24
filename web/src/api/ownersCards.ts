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
