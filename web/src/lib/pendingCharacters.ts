import type { CharacterConnection, PartyStateDynamic } from '@/models'

/** pending-character-cards.tsx (party-console v1.2.0): status labels and
 *  which characters still show a "pending" card instead of a live one. */
export const pendingLabels = {
  loading: 'Loading in Steam',
  code: 'CODE active — waiting for Party Console',
  stopped: 'CODE stopped',
  waiting: 'Waiting for Steam status',
  lost: 'Connection lost',
  connected: 'Connected',
} as const

export interface PendingCharacter {
  name: string
  primary: boolean
  status: keyof typeof pendingLabels
  delayed: boolean
  error?: string
}

export function pendingCharacters(state: PartyStateDynamic, liveNames: readonly string[]): PendingCharacter[] {
  const bankbois = new Set((state.bankbois || []).map((bankboi) => bankboi.name))
  if (state.bankboiTransaction) bankbois.add(state.bankboiTransaction.bankboi)
  const entries = state.characterConnections || []
  const known = new Set(entries.map((entry) => entry.name))
  const live = new Set(liveNames)
  const waiting = (state.activeSlots || []).filter(
    (slot) => slot.character && !bankbois.has(slot.character) && !known.has(slot.character) && !live.has(slot.character),
  )
  return [
    ...entries
      .filter((entry) => !bankbois.has(entry.name) && (entry.status !== 'connected' || !live.has(entry.name)))
      .map((entry) => ({ name: entry.name, primary: !!entry.primary, status: entry.status, delayed: !!entry.delayed, error: entry.error ?? undefined })),
    ...waiting.map((slot) => ({ name: slot.character!, primary: !!slot.primary, status: 'waiting' as const, delayed: false, error: undefined })),
  ]
}

/** The delayed-help text under a pending card. */
export function pendingHelp(entry: Pick<CharacterConnection, 'status'>): string {
  return entry.status === 'stopped'
    ? 'CODE is stopped. Click Engage in the game client when you want to resume.'
    : entry.status === 'lost'
      ? 'The game client stopped reporting. Check that it is open and can reach Party Console.'
      : entry.status === 'code'
        ? 'Party Console hasn’t received this character’s status yet. If it stays stuck, click Disengage, then Engage in the Steam client’s CODE window.'
        : 'Still waiting for the game client to finish loading. Check its window for a connection or loading error.'
}
