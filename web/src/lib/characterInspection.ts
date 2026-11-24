import type { PartyApiClient } from '@/api/partyApi'
import type { OfflineCharacter } from '@/models'

const object = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {})
const NUMBERS = ['level', 'xp', 'max_xp', 'hp', 'max_hp', 'mp', 'max_mp', 'gold', 'x', 'y', 'seenAt']

/** Console 1.5 load-character-inspection.ts inspection(): the saved account profile
 *  that GET /characters/:name/inspection returns for `name`. */
export function validInspection(value: unknown, name: string): value is OfflineCharacter {
  const character = object(value)
  const source = object(character.inspection)
  return (
    character.name === name &&
    typeof character.ctype === 'string' &&
    typeof character.map === 'string' &&
    NUMBERS.every((key) => typeof character[key] === 'number' && Number.isFinite(character[key])) &&
    typeof character.rip === 'boolean' &&
    typeof character.banking === 'boolean' &&
    Array.isArray(character.items) &&
    character.items.every((raw) => !raw || (typeof object(raw).slot === 'number' && typeof object(object(raw).item).name === 'string')) &&
    !!character.slots &&
    typeof character.slots === 'object' &&
    source.source === 'account-snapshot' &&
    typeof source.calculated === 'boolean' &&
    typeof source.note === 'string'
  )
}

/** Reads an offline character's saved profile. The server checks the roster and
 *  answers 404 for a name it does not own, 502 when the game fetch fails. */
export async function loadCharacterInspection(api: PartyApiClient, name: string): Promise<OfflineCharacter> {
  const result = await api.getJsonReportingError<{ character?: unknown }>(`characters/${encodeURIComponent(name)}/inspection`)
  if (result.kind === 'failure') throw Error(result.message || 'Could not read saved character')
  if (!validInspection(result.value.character, name)) throw Error('Invalid saved character response')
  return result.value.character
}
