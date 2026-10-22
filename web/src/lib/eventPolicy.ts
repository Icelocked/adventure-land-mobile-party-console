/** Console 1.5: dashboard/lib/event-policy.ts. */
import { validMix, type CipherSettings, type CipherView } from './cipher'

export interface EventLimits {
  deathLimit: number | null
  timeLimitMinutes: number | null
  // Graveyard's monster filter, a subset of zombie, ghoul and gargoyle.
  monsters?: string[]
  // Witch's Cipher settings (runtime/events/october.ts CipherSettings).
  cipher?: CipherSettings
}
export const graveyardMonsters = ['zombie', 'ghoul', 'gargoyle']
function validCipher(cipher: CipherSettings): boolean {
  const { gatherMinutes, minClues, gatherMonsters, manual } = cipher
  return (
    typeof cipher.automatic === 'boolean' &&
    (gatherMinutes === undefined || (Number.isFinite(gatherMinutes) && gatherMinutes >= 0 && gatherMinutes <= 20)) &&
    Number.isSafeInteger(minClues) && minClues >= 0 && minClues <= 1024 &&
    (gatherMonsters === undefined || (Array.isArray(gatherMonsters) && gatherMonsters.length === 4 && gatherMonsters.every((id) => typeof id === 'string' && !!id))) &&
    (manual === undefined ||
      (!!manual && typeof manual.id === 'string' && !!manual.id && typeof manual.round === 'string' && !!manual.round &&
        Number.isSafeInteger(manual.cracks) && manual.cracks >= 0 && validMix(manual.mix)))
  )
}
/** Blank (null) means unlimited; a death limit is a whole number >= 0, a time limit a positive number of minutes. */
export function validEventLimits(value: unknown): value is EventLimits {
  if (!value || typeof value !== 'object') return false
  const { deathLimit, timeLimitMinutes, monsters, cipher } = value as EventLimits
  if (monsters !== undefined && (!Array.isArray(monsters) || new Set(monsters).size !== monsters.length || monsters.some((id) => !graveyardMonsters.includes(id)))) return false
  if (cipher !== undefined && (!cipher || !validCipher(cipher))) return false
  return (
    (deathLimit === null || (Number.isSafeInteger(deathLimit) && deathLimit >= 0)) &&
    (timeLimitMinutes === null || (typeof timeLimitMinutes === 'number' && Number.isFinite(timeLimitMinutes) && timeLimitMinutes > 0))
  )
}
export interface EventFormation {
  leader?: string | null
  merchantCharacter?: string | null
  followers?: Record<string, boolean>
  eventsByCharacter?: Record<string, boolean>
  eventLimitsByCharacter?: Record<string, Record<string, EventLimits>>
  eventPrioritiesByCharacter?: Record<string, string[]>
  eventSelectionsByCharacter?: Record<string, string[]>
}

// A saved legacy all-events flag covers the events that existed when it was saved; newer
// fights need an explicit selection, so an upgrade never opts a character into them.
const legacyDefaultEvents = ['anniversary', 'abtesting', 'goobrawl', 'crabxx', 'franky', 'icegolem', 'snowman']
// Console 1.5 dashboard lib/event-policy.ts octoberEvents. A list without them
// makes a checkbox or reorder POST drop their saved selections and order.
export const octoberEvents = ['horseman', 'graveyard', 'trickortreat', 'witchcipher']
export const supportedEvents = [...legacyDefaultEvents, 'slenderman', 'mrgreen', 'mrpumpkin', ...octoberEvents]
export const eventDisplayNames: Record<string, string> = {
  anniversary: 'Anniversary', abtesting: 'A/B Testing', goobrawl: 'Goobrawl',
  crabxx: 'Crabxx', franky: 'Franky', icegolem: 'Ice Golem', snowman: 'Snowman',
  slenderman: 'Slenderman', mrgreen: 'Mr. Green', mrpumpkin: 'Mr. Pumpkin',
  horseman: 'Headless Horseman', graveyard: 'Graveyard Rising', trickortreat: 'Trick or Treat', witchcipher: "Witch's Cipher",
}

/** The merchant brews the leader's Witch's Cipher, so it inherits that one event from the leader. */
export function leaderCipher(party: EventFormation, name: string): boolean {
  return !!(name === party.merchantCharacter && party.leader && party.eventSelectionsByCharacter?.[party.leader]?.includes('witchcipher'))
}

export function selectedEvents(party: EventFormation, name: string): string[] {
  const source = eventPolicy(party, name).source
  const saved = party.eventSelectionsByCharacter?.[source]
  const selections = saved ?? ['anniversary', ...(party.eventsByCharacter?.[source] ? legacyDefaultEvents.filter((id) => id !== 'anniversary') : [])]
  const accountCipher = leaderCipher(party, name)
  return eventPriorityOrder(party, name).filter((id) => selections.includes(id) || (accountCipher && id === 'witchcipher'))
}

export function eventEnabled(party: EventFormation, name: string, event: string) {
  return selectedEvents(party, name).includes(event)
}

export function eventPolicy(party: EventFormation, name: string) {
  const inherited = Boolean(party.leader && name !== party.leader && name !== party.merchantCharacter && party.followers?.[name])
  const source = inherited ? party.leader! : name
  return {
    inherited,
    source,
    enabled:
      leaderCipher(party, name) ||
      (party.eventSelectionsByCharacter?.[source]
        ? party.eventSelectionsByCharacter[source].some((id) => id !== 'anniversary' && supportedEvents.includes(id))
        : Boolean(party.eventsByCharacter?.[source])),
  }
}

/** The character's event priority order; events added later go to the end. */
export function eventPriorityOrder(party: EventFormation, name: string): string[] {
  const source = eventPolicy(party, name).source
  return [...new Set([...(party.eventPrioritiesByCharacter?.[source] ?? []), ...supportedEvents])].filter((id) => supportedEvents.includes(id))
}

export function eventLimits(party: EventFormation, name: string): Record<string, EventLimits> {
  const limits = party.eventLimitsByCharacter?.[eventPolicy(party, name).source] ?? {}
  if (leaderCipher(party, name))
    return { ...limits, witchcipher: party.eventLimitsByCharacter?.[party.leader!]?.witchcipher ?? { deathLimit: null, timeLimitMinutes: null } }
  return limits
}

export type EventSchedule = {
  id: string
  name: string
  live?: boolean
  next?: number
  expires?: number
  stale?: boolean
  slotAt?: number
  slotKind?: string
  // Console 1.5: the realm clock's lead over this machine, the realm's UTC offset,
  // whether the realm schedule is confirmed, and the next seven days of starts.
  clockOffsetMs?: number
  realmOffsetHours?: number
  confirmed?: boolean
  occurrences?: { at: number; status: string }[]
  cipher?: CipherView
}

/** Console 1.5 event-selection-control.tsx eventTimeLabel: weekday, local time and the countdown. */
export function eventTimeLabel(next: number | undefined, now: number, clockOffsetMs = 0) {
  if (!next || !Number.isFinite(next)) return 'Time not announced'
  const ms = next < 1e12 ? next * 1000 : next
  const remaining = Math.max(0, ms - now - clockOffsetMs)
  return `${new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(ms)} (${Math.floor(remaining / 60000)}m ${Math.floor(remaining / 1000) % 60}s)`
}

/** The start time on the realm's clock, e.g. "Realm: 14:05 (UTC-5)" with a U+2212 minus, as
 *  event-selection-control.tsx realmTimeLabel() writes it. */
export function realmTimeLabel(next: number, offset: number) {
  const ms = next < 1e12 ? next * 1000 : next
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms + offset * 3600000)
  return `Realm: ${time} (UTC${offset < 0 ? '−' : '+'}${Math.abs(offset)})`
}
