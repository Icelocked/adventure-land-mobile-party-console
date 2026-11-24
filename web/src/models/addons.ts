// The add-on list GET /party-api/addons answers (console runtime/hooks/http.ts `list`): each
// installed add-on with its declared settings, and each slot's enabled entries with the button
// and status line the dashboard, the PWA and the APK draw alike.

// The colour names the core uses (console runtime/hooks/registry.ts SLOT_COLORS); each app maps a
// name to its own palette.
export const SLOT_COLORS = ['slate', 'cyan', 'emerald', 'violet', 'amber', 'rose', 'sky'] as const
export type SlotColor = (typeof SLOT_COLORS)[number]
export type SlotName = 'target-mode' | 'combat-mode' | 'combat-routine' | 'formation' | 'merchant-routine'

// `status.field` names a field of the add-on's scope store; `idle` shows while it is empty.
export interface SlotEntry {
  mode: string
  addon: string
  button: { label: string; description: string; color: SlotColor }
  status?: { title: string; field: string; idle: string }
  classes?: readonly string[]
}

// One declared add-on setting with its saved value. A `character` setting takes `choices`; a
// `per-character` or `records` setting lists `characters`, and a `records` setting its `fields`.
export interface AddonSettingListing {
  label: string
  kind: string
  default: unknown
  value: unknown
  choices?: string[]
  characters?: string[]
  min?: number
  max?: number
  fields?: Record<string, { label: string; kind: string; choices?: string[]; min?: number; max?: number }>
}
export interface AddonListing {
  name: string
  author: string
  summary: string
  enabled: boolean
  settings: Record<string, AddonSettingListing>
}
export interface AddonsReply {
  addons: AddonListing[]
  slots: Record<SlotName, SlotEntry[]>
  rings?: { ring: string; addon: string; label: string }[]
  overlays?: Record<string, string>
  refusals?: { name: string; message: string }[]
  stores?: Record<string, Record<string, Record<string, unknown>>>
}

export const emptySlots = (): Record<SlotName, SlotEntry[]> => ({ 'combat-mode': [], 'target-mode': [], 'combat-routine': [], formation: [], 'merchant-routine': [] })

/** An entry's label, else its mode (console farming-mode-control.tsx `label`). */
export function entryLabel(entries: readonly SlotEntry[], mode: string): string {
  return entries.find((entry) => entry.mode === mode)?.button.label ?? mode
}

/** Each target mode entry's status line from the scope's add-on stores: the store field's text,
 *  else the entry's idle words (console runtime/hooks/dashboard/slots.tsx addonSections). */
export function addonStatusLines(
  targetEntries: readonly SlotEntry[],
  stores: Record<string, Record<string, unknown>>,
): Record<string, { title: string; message: string; color: SlotColor }> {
  const status: Record<string, { title: string; message: string; color: SlotColor }> = {}
  for (const entry of targetEntries) {
    if (!entry.status) continue
    const message = (stores[entry.addon] ?? {})[entry.status.field]
    status[entry.mode] = { title: entry.status.title, message: typeof message === 'string' && message ? message : entry.status.idle, color: entry.button.color }
  }
  return status
}

/** An add-on's name as the player reads it: the folder name, title-cased (console slots.tsx addonTitle). */
export const addonTitle = (name: string) => name.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
