import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { useSettingsWrite } from '@/data/useSettingsWrite'
import { useAddons } from '@/data/useAddons'
import { useDynamicState } from '@/data/PartyDataProvider'
import type { BestiaryMonster, SlotName } from '@/models'

// A character's Combat section (console combat-settings-section.tsx): "Heal first below", the HP
// and MP potion lines, the two reflect lists and the add-on routine picks. Each is its owner's
// declared per-character setting, written through the settings route; an empty box shows the
// owner's default, which the owner applies when the character has no entry. Each line's words are
// the declared label from the settings read.
const LINES = [
  { field: 'healFirstBelow', fighters: true },
  { field: 'hpPotionBelow', fighters: false },
  { field: 'mpPotionBelow', fighters: false },
] as const
// The targeting owner's default lists (console characters/targeting/reflect.ts defaultLists).
const LISTS = [
  { field: 'reflectMagicByCharacter', rating: 'reflection', defaults: ['slenderman', 'tiger', 'goblin'] },
  { field: 'reflectPhysicalByCharacter', rating: 'dreturn', defaults: ['porcupine'] },
] as const
// A merchant gets no formation line, since it stands outside the grouped fight, and only the
// merchant gets the merchant routine line.
const ROUTINE_SLOTS: { slot: SlotName; label: string; for: 'all' | 'fighters' | 'merchant' }[] = [
  { slot: 'combat-routine', label: 'Combat routine', for: 'all' },
  { slot: 'formation', label: 'Formation', for: 'fighters' },
  { slot: 'merchant-routine', label: 'Merchant routine', for: 'merchant' },
]

/** The monsters one reflect list can hold: those whose game data rates the list's field above
 *  zero (console reflect.ts reflectChoices). */
export function reflectChoices(monsters: readonly BestiaryMonster[], rating: 'reflection' | 'dreturn'): string[] {
  return monsters.filter((monster) => Number((monster.definition as Record<string, unknown> | undefined)?.[rating]) > 0).map((monster) => monster.id).sort()
}

export function CombatSettingsSection({ character, ctype }: { character: string; ctype: string }) {
  const settings = useSettingsWrite()
  const { slots } = useAddons()
  const monsters = useDynamicState().bestiaryCatalog
  const merchant = ctype === 'merchant'
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [refusal, setRefusal] = useState('')
  // Until the settings read arrives the fieldset stays locked and a line shows its field name.
  const label = (field: string) => settings.declared(field)?.label ?? field
  const entry = (field: string) => (settings.value(field) as Record<string, unknown> | undefined)?.[character]
  const saved = (field: string) => {
    const value = entry(field)
    return typeof value === 'number' ? String(value) : ''
  }
  // A box saves once, when it commits (blur or Enter). An emptied line sends null, which the
  // writer takes as removal of the character's entry; text that is not a number stays and says so.
  const commit = async (field: string) => {
    if (!(field in drafts)) return
    const draft = drafts[field].trim()
    const value = draft ? Number(draft) : null
    if (value !== null && !Number.isFinite(value)) return setRefusal(`"${draft}" is not a number.`)
    setRefusal('')
    setDrafts((current) => {
      const next = { ...current }
      delete next[field]
      return next
    })
    await settings.write([{ field, character, value }])
  }
  const picks = (settings.value('routines') as Record<string, Record<string, string>> | undefined)?.[character] ?? {}
  // A routine line shows only when an enabled add-on fills its slot for this class.
  const routines = ROUTINE_SLOTS.filter((line) => line.for === 'all' || (line.for === 'merchant') === merchant)
    .map(({ slot, label: name }) => ({ slot, name, entries: slots[slot].filter((e) => !e.classes || e.classes.includes(ctype)) }))
    .filter((line) => line.entries.some((e) => !e.addon.startsWith('core:')))
  return (
    <section aria-label="Combat settings">
      <fieldset disabled={!settings.ready || settings.pending} aria-busy={!settings.ready} className="flex flex-col gap-3">
        {LINES.filter((line) => !merchant || !line.fighters).map((line) => (
          <label key={line.field} className="flex flex-col gap-1 text-xs">
            {label(line.field)}
            <Input
              value={drafts[line.field] ?? saved(line.field)}
              placeholder="default"
              inputMode="numeric"
              aria-label={`${label(line.field)} for ${character}`}
              onChange={(event) => setDrafts((current) => ({ ...current, [line.field]: event.target.value }))}
              onBlur={() => void commit(line.field)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />
          </label>
        ))}
        {!merchant &&
          LISTS.map(({ field, rating, defaults }) => {
            const own = entry(field) as string[] | undefined
            const value = own ?? [...defaults]
            const toggle = (id: string, on: boolean) => void settings.write([{ field, character, value: on ? [...value, id] : value.filter((v) => v !== id) }])
            return (
              <fieldset key={field} className="flex flex-col gap-1 rounded-md border border-border p-2 text-xs">
                <legend>
                  {label(field)}
                  {own ? '' : ' · default'}
                </legend>
                {reflectChoices(monsters, rating).map((id) => (
                  <label key={id} className="flex items-center gap-2">
                    <input type="checkbox" checked={value.includes(id)} onChange={(event) => toggle(id, event.target.checked)} className="size-4" />
                    {monsters.find((m) => m.id === id)?.name ?? id}
                  </label>
                ))}
              </fieldset>
            )
          })}
        {routines.map(({ slot, name, entries }) => (
          <label key={slot} className="flex flex-col gap-1 text-xs">
            {name}
            <select
              aria-label={`${name} for ${character}`}
              value={picks[slot] ?? entries[0].mode}
              onChange={(event) => void settings.write([{ field: 'routines', character, value: { ...picks, [slot]: event.target.value } }])}
              className="h-9 rounded-md border border-border bg-background px-2"
            >
              {entries.map((e) => (
                <option key={e.mode} value={e.mode} title={e.button.description}>{e.button.label}</option>
              ))}
            </select>
          </label>
        ))}
        {(refusal || settings.notice) && <p role="alert" className="text-xs text-amber-400">{refusal || settings.notice}</p>}
      </fieldset>
    </section>
  )
}
