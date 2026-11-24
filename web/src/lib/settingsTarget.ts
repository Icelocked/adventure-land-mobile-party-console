// Where the settings menu opens: a row-1 tab and, in it, a row-2 section (console
// settings-target.ts). The PWA keeps the target in the menu's address, so every settings button
// links to its own place and Back returns to the screen it came from.
// - `account`, `events` and `addons` are the shared tabs; `character` is one character's tab.
// - In the Events tab the section is "cave" or a character's name.
export type SettingsTarget =
  | { tab: 'account'; section?: AccountSection }
  | { tab: 'events'; section?: string }
  | { tab: 'addons'; section?: string }
  | { tab: 'character'; character: string; section?: CharacterSection }

export const ACCOUNT_SECTIONS = [
  { id: 'import', label: 'Import/Export' },
  { id: 'realm', label: 'Realm' },
  { id: 'characters', label: 'Characters' },
  { id: 'aldata', label: 'ALData' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'display', label: 'Display' },
  { id: 'apps', label: 'Apps' },
  { id: 'hosting', label: 'Hosting' },
  { id: 'console', label: 'Console' },
] as const
export type AccountSection = (typeof ACCOUNT_SECTIONS)[number]['id']

export type CharacterSection = 'farming' | 'combat' | 'restock' | 'merchant' | 'routines'
const CHARACTER_SECTIONS: { id: CharacterSection; label: string }[] = [
  { id: 'farming', label: 'Farming' },
  { id: 'combat', label: 'Combat' },
  { id: 'restock', label: 'Restock' },
  { id: 'merchant', label: 'Merchant' },
  { id: 'routines', label: 'Routines' },
]
// The merchant has no farming line, so no Farming section, and only the merchant has the
// Merchant and Routines sections.
export function characterSections(merchant: boolean): { id: CharacterSection; label: string }[] {
  return CHARACTER_SECTIONS.filter((entry) => (merchant ? entry.id !== 'farming' : entry.id !== 'merchant' && entry.id !== 'routines'))
}

export const SETTINGS_MENU_PATH = '/settings/menu'

export function settingsMenuPath(target: SettingsTarget): string {
  const query = new URLSearchParams({ tab: target.tab })
  if (target.tab === 'character') query.set('character', target.character)
  if (target.section) query.set('section', target.section)
  return `${SETTINGS_MENU_PATH}?${query}`
}

export function parseSettingsTarget(search: URLSearchParams): SettingsTarget {
  const tab = search.get('tab'), section = search.get('section') ?? undefined
  if (tab === 'character' && search.get('character')) return { tab, character: search.get('character')!, section: section as CharacterSection | undefined }
  if (tab === 'events' || tab === 'addons') return { tab, section }
  return { tab: 'account', section: section as AccountSection | undefined }
}
