/** Console 1.5: dashboard/lib/event-policy.ts. */
export interface EventLimits {
  deathLimit: number | null
  timeLimitMinutes: number | null
  // Graveyard's monster filter, a subset of zombie, ghoul and gargoyle.
  monsters?: string[]
  // Witch's Cipher settings (runtime/events/october.ts CipherSettings).
  cipher?: Record<string, unknown>
}
/** Blank (null) means unlimited; a death limit is a whole number >= 0, a time limit a positive number of minutes. */
export function validEventLimits(value: unknown): value is EventLimits {
  if (!value || typeof value !== 'object') return false
  const { deathLimit, timeLimitMinutes } = value as EventLimits
  return (
    (deathLimit === null || (Number.isSafeInteger(deathLimit) && deathLimit >= 0)) &&
    (timeLimitMinutes === null || (typeof timeLimitMinutes === 'number' && Number.isFinite(timeLimitMinutes) && timeLimitMinutes > 0))
  )
}
interface EventFormation {
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

export function selectedEvents(party: EventFormation, name: string): string[] {
  const source = eventPolicy(party, name).source
  const saved = party.eventSelectionsByCharacter?.[source]
  const selections = saved ?? ['anniversary', ...(party.eventsByCharacter?.[source] ? legacyDefaultEvents.filter((id) => id !== 'anniversary') : [])]
  return eventPriorityOrder(party, name).filter((id) => selections.includes(id))
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
    enabled: party.eventSelectionsByCharacter?.[source]
      ? party.eventSelectionsByCharacter[source].some((id) => id !== 'anniversary' && supportedEvents.includes(id))
      : Boolean(party.eventsByCharacter?.[source]),
  }
}

/** The character's event priority order; events added later go to the end. */
export function eventPriorityOrder(party: EventFormation, name: string): string[] {
  const source = eventPolicy(party, name).source
  return [...new Set([...(party.eventPrioritiesByCharacter?.[source] ?? []), ...supportedEvents])].filter((id) => supportedEvents.includes(id))
}

export function eventLimits(party: EventFormation, name: string): Record<string, EventLimits> {
  return party.eventLimitsByCharacter?.[eventPolicy(party, name).source] ?? {}
}

export type EventSchedule = { id: string; name: string; live?: boolean; next?: number; expires?: number; stale?: boolean; slotAt?: number; slotKind?: string }

export function eventTimeLabel(next: number | undefined, now: number) {
  if (!next || !Number.isFinite(next)) return 'Time not announced'
  const ms = next < 1e12 ? next * 1000 : next
  const remaining = Math.max(0, ms - now)
  return `${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(ms)} (${Math.floor(remaining / 60000)}m ${Math.floor(remaining / 1000) % 60}s)`
}
