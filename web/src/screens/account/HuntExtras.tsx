import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SpriteIcon } from '@/components/SpriteIcon'
import { FarmingAreaPreview } from '@/components/map/FarmingAreaPreview'
import { zones, type Catalog, type Zone } from '@/lib/farmingZones'
import { defaultPassiveRule, huntSpawnKey, type PassivePatch, type PassiveSettings } from '@/lib/hunting'
import type { ApiResult, CommandResult } from '@/api/partyApi'
import type { Sprite } from '@/models'

export type MonsterChoiceEntry = { id: string; name?: string; sprite?: Sprite | null; locations?: Catalog[number]['locations'] }
const nameOf = (monster: MonsterChoiceEntry) => monster.name || monster.id

/** Any monster, searchable, added to this
 *  character's Hunt blacklist ("Added" once it is). */
export function HuntBlacklistPicker({ catalog, blacklist, disabled, onAdd, onInspect }: { catalog: MonsterChoiceEntry[]; blacklist: Record<string, unknown>; disabled?: boolean; onAdd: (id: string) => Promise<ApiResult<CommandResult>>; onInspect?: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const rows = catalog
    .filter((monster) => monster.id !== 'all' && `${nameOf(monster)} ${monster.id}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)) || a.id.localeCompare(b.id))
  const add = async (id: string) => {
    if (disabled || busy || blacklist[id]) return
    setBusy(true)
    setError('')
    const result = await onAdd(id)
    setBusy(false)
    if (result.kind === 'failure') setError(result.message || 'Could not add monster to blacklist')
  }
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => {
          setSearch('')
          setError('')
          setOpen((value) => !value)
        }}
      >
        Add
      </Button>
      {open && (
        <div role="group" aria-label="Add to Hunt blacklist" className="mt-2 w-full rounded-md border border-border p-2">
          <p className="text-sm font-medium">Add to Hunt blacklist</p>
          <p className="mb-2 text-xs text-muted-foreground">Choose any monster to skip its Hunt quests. Click a monster for details.</p>
          <Input aria-label="Search blacklist monsters" placeholder="Search monsters…" value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
            {rows.map((monster) => (
              <div key={monster.id} className="flex items-center gap-2 rounded border border-border p-1.5">
                <button type="button" aria-label={`Inspect ${nameOf(monster)}`} onClick={() => onInspect?.(monster.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  {monster.sprite && <SpriteIcon sprite={monster.sprite} size={32} />}
                  <span className="min-w-0 flex-1 text-sm">
                    {nameOf(monster)}
                    <span className="block text-xs text-muted-foreground">{monster.id}</span>
                  </span>
                </button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={disabled || busy || !!blacklist[monster.id]}
                  aria-label={blacklist[monster.id] ? `${nameOf(monster)} is blacklisted` : `Add ${nameOf(monster)} to blacklist`}
                  onClick={() => void add(monster.id)}
                >
                  {blacklist[monster.id] ? 'Added' : 'Add to blacklist'}
                </Button>
              </div>
            ))}
            {!rows.length && <p className="text-sm text-muted-foreground">No matching monsters.</p>}
          </div>
          {error && (
            <p role="alert" className="mt-1 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </>
  )
}

/** For each monster with more than one spawn,
 *  Automatic (default) or a specific spawn; saved as preferredSpawns. */
export function HuntSpawnSettings({
  catalog,
  preferred,
  disabled,
  onSave,
}: {
  catalog: MonsterChoiceEntry[]
  preferred: Record<string, unknown>
  disabled?: boolean
  onSave: (patch: { preferredSpawns: Record<string, string> }) => Promise<ApiResult<CommandResult>>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState('')
  // The expanded monster's (or focused spawn's) area on the map.
  const [preview, setPreview] = useState<Zone | null>(null)
  const monsters = useMemo(
    () =>
      !open
        ? []
        : catalog
            .map((monster) => ({ ...monster, spawns: zones([monster as Catalog[number]], [monster.id]) }))
            .filter((monster) => monster.spawns.length > 1)
            .sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
    [catalog, open],
  )
  const select = async (monster: string, key: string) => {
    setBusy(true)
    setError(null)
    setSaved('')
    const result = await onSave({ preferredSpawns: { [monster]: key } })
    setBusy(false)
    if (result.kind === 'failure') setError(result.message || 'Could not save preferred spawn')
    else setSaved('Preference saved for future Monster Hunts.')
  }
  return (
    <section aria-label="Preferred hunt spawns" className="flex flex-col gap-2">
      <Button size="sm" variant="outline" className="w-fit" disabled={disabled} onClick={() => setOpen((value) => !value)}>
        Set preferred hunt spawns
      </Button>
      {open && (
        <div className="rounded-md border border-border p-2">
          <p className="text-sm font-medium">Preferred hunt spawns</p>
          <p className="mb-2 text-xs text-muted-foreground">
            Choose where to hunt each monster. Changes apply to future Monster Hunt destinations only. Automatic prefers the nearest spawn on your leader’s map. Unavailable spawns use automatic selection.
          </p>
          {monsters.length === 0 && <p className="text-sm text-muted-foreground">No monsters with multiple available spawns.</p>}
          {monsters.map((monster) => {
            const preference = preferred[monster.id]
            const selected = monster.spawns.some((spawn) => huntSpawnKey(spawn) === preference) ? (preference as string) : ''
            return (
              <details
                key={monster.id}
                className="mb-1.5 rounded border border-border"
                onToggle={(event) => {
                  if (event.currentTarget.open) setPreview(monster.spawns.find((spawn) => huntSpawnKey(spawn) === selected) || monster.spawns[0])
                }}
              >
                <summary className="cursor-pointer p-2 text-sm">
                  <span className="inline-flex items-center gap-2 align-middle">
                    {monster.sprite && <SpriteIcon sprite={monster.sprite} size={24} />}
                    <span>
                      {nameOf(monster)}{' '}
                      <span className="text-xs text-muted-foreground">
                        · {monster.spawns.length} spawns{selected ? ' · Custom' : ' · Default'}
                      </span>
                    </span>
                  </span>
                </summary>
                <fieldset disabled={disabled || busy} className="space-y-1.5 border-t border-border p-2">
                  <legend className="sr-only">Preferred spawn for {nameOf(monster)}</legend>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name={`spawn-${monster.id}`} checked={!selected} onChange={() => void select(monster.id, '')} />
                    Automatic <span className="text-xs text-muted-foreground">(default)</span>
                  </label>
                  {monster.spawns.map((spawn) => {
                    const key = huntSpawnKey(spawn)
                    return (
                      <label key={key} className="flex items-center gap-2 text-sm" onClick={() => setPreview(spawn)} onFocus={() => setPreview(spawn)}>
                        <input
                          type="radio"
                          name={`spawn-${monster.id}`}
                          checked={selected === key}
                          onChange={() => {
                            setPreview(spawn)
                            void select(monster.id, key)
                          }}
                        />
                        {spawn.mapName || spawn.map}{' '}
                        <span className="text-muted-foreground">
                          ({Math.round(spawn.x)}, {Math.round(spawn.y)})
                        </span>
                      </label>
                    )
                  })}
                </fieldset>
              </details>
            )
          })}
          <div className="mt-2 h-72" aria-label="Preferred hunt spawn map preview">
            {preview ? <FarmingAreaPreview area={{ ...preview, id: preview.id || huntSpawnKey(preview) }} radius={400} /> : <p className="p-5 text-sm text-muted-foreground">Expand a monster to preview its spawn areas.</p>}
          </div>
          {busy && <p role="status" className="text-sm">Saving preference…</p>}
          {saved && <p role="status" className="text-sm">{saved}</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

/** Passive hunting: the field-generator toggle and the per-monster
 *  table (attack on sight, keep moving, max level -1 = any, priority 0–1000). */
export function PassiveHuntingMenu({
  settings,
  catalog,
  disabled,
  onSave,
  onInspect,
}: {
  settings: PassiveSettings
  catalog: MonsterChoiceEntry[]
  disabled?: boolean
  onSave: (patch: PassivePatch) => Promise<ApiResult<CommandResult>>
  onInspect?: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [about, setAbout] = useState(false)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [levelDrafts, setLevelDrafts] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const rule = (id: string) => settings.rules[id] || defaultPassiveRule(id)
  const save = async (patch: PassivePatch) => {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await onSave(patch)
    setBusy(false)
    if (result.kind === 'failure') setError(result.message || 'Could not save passive hunting settings')
  }
  const commitLevel = (id: string) => {
    const draft = levelDrafts[id]
    if (draft === undefined) return
    const value = Number(draft)
    if (!draft.trim() || !Number.isSafeInteger(value) || (value !== -1 && value <= 0)) return setError('Max level must be -1 (any level) or a positive whole number.')
    setLevelDrafts(({ [id]: _, ...rest }) => rest)
    if (value !== (rule(id).maxLevel ?? -1)) void save({ rules: { [id]: { maxLevel: value } } })
  }
  const commit = (id: string) => {
    if (drafts[id] === undefined) return
    const value = Number(drafts[id])
    if (!drafts[id].trim() || !Number.isInteger(value) || value < 0 || value > 1000) return setError('Priority must be a whole number from 0 to 1000.')
    setDrafts(({ [id]: _, ...rest }) => rest)
    if (value !== rule(id).priority) void save({ rules: { [id]: { priority: value } } })
  }
  const rows = catalog
    .filter((monster) => monster.id !== 'all' && monster.id !== 'fieldgen0' && `${nameOf(monster)} ${monster.id}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => Number(rule(b.id).enabled) - Number(rule(a.id).enabled) || nameOf(a).localeCompare(nameOf(b)) || a.id.localeCompare(b.id))
  const locked = disabled || busy
  return (
    <section aria-label="Passive hunting" className="flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-sm">Monsters that are automatically attacked when spotted on the map</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" disabled={locked} checked={settings.useFieldGenerators} onChange={(event) => void save({ useFieldGenerators: event.target.checked })} />
        Use field generators when passively hunting fairy
      </label>
      <Button size="sm" variant="outline" className="w-fit" onClick={() => setOpen((value) => !value)}>
        Open passive hunting menu
      </Button>
      {open && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Passive hunting</p>
            <button type="button" aria-label="About passive hunting" aria-expanded={about} onClick={() => setAbout((value) => !value)} className="rounded border border-border p-1">
              <Info className="h-4 w-4" />
            </button>
          </div>
          {about && (
            <div role="note" className="rounded border border-border p-2 text-xs">
              <p>&quot;Keep moving to destination&quot; means characters will not stop to engage the sighted monster until death. They will only attack while in range, and will not chase, reposition, or start kiting behavior.</p>
              <p className="mt-2">This setting also applies when the monster attacks back. Emergency escape and recovery still take precedence over this setting.</p>
              <p className="mt-2">Priority affects both active and passive hunting targets - it is recommended to set a higher priority for passive targets.</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Select monsters to attack on sight. Settings apply to the party. Max level -1 allows any level; a positive number limits intentional passive attacks.</p>
          <Input aria-label="Filter passive hunting monsters" placeholder="Search monsters…" value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="max-h-[55vh] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-background">
                <tr>
                  <th className="w-8 p-1.5">
                    <span className="sr-only">Enabled</span>
                  </th>
                  <th className="p-1.5">Monster</th>
                  <th className="p-1.5">Keep moving to destination</th>
                  <th className="p-1.5">Max level</th>
                  <th className="p-1.5">Priority</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((monster) => (
                  <tr key={monster.id} className="border-t border-border">
                    <td className="p-1.5">
                      <input
                        type="checkbox"
                        aria-label={`Passively hunt ${nameOf(monster)}`}
                        className="size-4"
                        disabled={locked}
                        checked={rule(monster.id).enabled}
                        onChange={(event) => void save({ rules: { [monster.id]: { enabled: event.target.checked } } })}
                      />
                    </td>
                    <td className="p-1.5">
                      <button type="button" aria-label={`Inspect ${nameOf(monster)}`} onClick={() => onInspect?.(monster.id)} className="flex items-center gap-1.5 text-left">
                        {monster.sprite && <SpriteIcon sprite={monster.sprite} size={24} />}
                        {nameOf(monster)}
                      </button>
                    </td>
                    <td className="p-1.5">
                      <input
                        type="checkbox"
                        aria-label={`Keep moving to destination for ${nameOf(monster)}`}
                        className="size-4"
                        disabled={locked}
                        checked={rule(monster.id).keepMoving}
                        onChange={(event) => void save({ rules: { [monster.id]: { keepMoving: event.target.checked } } })}
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        aria-label={`${nameOf(monster)} passive max level`}
                        type="number"
                        min={-1}
                        step={1}
                        disabled={locked}
                        className="w-16 rounded border border-border bg-background px-1.5 py-1"
                        value={levelDrafts[monster.id] ?? rule(monster.id).maxLevel ?? -1}
                        onChange={(event) => setLevelDrafts({ ...levelDrafts, [monster.id]: event.target.value })}
                        onBlur={() => commitLevel(monster.id)}
                        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        aria-label={`${nameOf(monster)} passive priority`}
                        type="number"
                        min={0}
                        max={1000}
                        step={1}
                        disabled={locked}
                        className="w-16 rounded border border-border bg-background px-1.5 py-1"
                        value={drafts[monster.id] ?? rule(monster.id).priority}
                        onChange={(event) => setDrafts({ ...drafts, [monster.id]: event.target.value })}
                        onBlur={() => commit(monster.id)}
                        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <p className="p-2 text-sm text-muted-foreground">No matching monsters.</p>}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
