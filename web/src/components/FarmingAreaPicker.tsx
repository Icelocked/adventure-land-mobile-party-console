import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SpriteIcon } from '@/components/SpriteIcon'
import { farmingAreas, defaultPhoenixOrder, type FarmingArea } from '@/lib/farmingAreas'
import type { Catalog } from '@/lib/farmingZones'
import type { BestiaryMonster, Sprite } from '@/models'

/** monster-choice.tsx SpawnRecord / MonsterChoice. */
export interface SpawnRecord {
  sourceMap: string
  map: string
  mapName?: string
  x?: number
  y?: number
  count?: number
  restrictions: string[]
}
interface MonsterChoiceEntry {
  id: string
  name?: string
  sprite?: Sprite | null
  spawnRecords?: SpawnRecord[]
}

const SPAWN_REASONS: Record<string, string> = {
  ignore: 'Ignored map',
  instance: 'Instance-only map',
  irregular: 'Special-access map',
  'zero-count': 'Zero-count spawn; no regular population',
  'missing-map': 'Map definition unavailable',
  'invalid-geometry': 'Spawn coordinates unavailable',
}

/** monster-spawns.tsx: every recorded spawn and why ordinary routing can't use it. */
export function MonsterSpawns({ records }: { records?: SpawnRecord[] }) {
  return (
    <section className="rounded border border-emerald-800 p-3 text-sm">
      <h3 className="mb-2 font-semibold">Recorded spawn locations</h3>
      {records === undefined ? (
        <p>Waiting for refreshed spawn data.</p>
      ) : !records.length ? (
        <p>No static spawn recorded in game data.</p>
      ) : (
        <ul className="space-y-2">
          {records.map((record, index) => (
            <li key={`${record.sourceMap}:${record.map}:${index}`}>
              <p>
                {record.mapName || record.map} <span className="text-muted-foreground">({record.map})</span>
                {Number.isFinite(record.x) && Number.isFinite(record.y) ? ` · (${record.x}, ${record.y})` : ''}
                {record.count !== undefined ? ` · Count: ${record.count}` : ''}
              </p>
              <p className={record.restrictions.length ? 'text-amber-500' : 'text-cyan-500'}>
                {record.restrictions.length ? `${record.restrictions.map((reason) => SPAWN_REASONS[reason] || reason).join('; ')}. Ordinary hunt routing unavailable.` : 'Available for ordinary hunt routing.'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Ported from party-console's farming-area-picker.tsx - the dashboard's one
 * component for every "pick a place to farm these monsters" flow:
 *  - `preparation`: Hunt backup setup (monster picker inline, Phoenix's own
 *    patrol mode is deliberately OFF here - matches the real dashboard,
 *    which disables it during hunt prep specifically).
 *  - Phoenix selected (and not `preparation`): the 5-region ordered patrol.
 *  - otherwise: the general "choose a farming area" picker - areas grouped
 *    by how many of the selected monsters share them, ranked by distance
 *    to the character's current position.
 *
 * No visual map-tile preview (party-console's MapCanvas/FarmingAreaPreview) -
 * that's a separate, large tile-rendering subsystem of its own. Ryan's own
 * component already tolerates the preview failing to load ("Map preview
 * unavailable. You can still choose this area."), so a text-only area
 * summary (map, coordinates, which monsters, shared-count) is a reasonable,
 * fully-functional substitute, not a silent downgrade.
 */
export function FarmingAreaPicker({
  catalog,
  bestiaryCatalog,
  ids,
  onIdsChange,
  character,
  waypoint,
  override = false,
  radius,
  busy,
  preparation,
  savedPhoenixOrder,
  onCancel,
  onStart,
}: {
  catalog: Catalog
  bestiaryCatalog: BestiaryMonster[]
  ids: string[]
  /** Only used in `preparation` mode - lets the inline monster picker edit the selection. */
  onIdsChange?: (ids: string[]) => void
  character?: { map: string; x: number; y: number } | null
  // party-workspace.tsx: the saved waypoint is preferred over proximity.
  waypoint?: { map: string; x: number; y: number } | null
  // A monster navigation (bestiary) rather than a waypoint for the focus.
  override?: boolean
  radius: number
  busy: boolean
  preparation?: boolean
  /** state.phoenixRouteOrder - a previously-saved 5-region search order, reused
   *  when it's still valid for the current areas rather than always falling
   *  back to the computed default. */
  savedPhoenixOrder?: string[]
  onCancel: () => void
  onStart: (area: FarmingArea, phoenixRouteOrder?: string[]) => void | Promise<void>
}) {
  const phoenix = ids.includes('phoenix') && !preparation
  const areas = useMemo(() => farmingAreas(catalog, phoenix ? ['phoenix'] : ids), [catalog, ids, phoenix])

  function startingOrder(candidateAreas: FarmingArea[]): string[] {
    const saved = (savedPhoenixOrder || []).filter((id) => candidateAreas.some((a) => a.id === id))
    return saved.length === 5 && new Set(saved).size === 5 ? saved : defaultPhoenixOrder(candidateAreas)
  }

  const [search, setSearch] = useState('')
  const [choice, setChoice] = useState<string | null>(null)
  // Lazy initializer (not a useEffect) so the saved order is seeded correctly
  // on the very first render, not just when `ids` later changes.
  const [order, setOrder] = useState<string[]>(() => (phoenix ? startingOrder(areas) : []))
  const [error, setError] = useState<string | null>(null)

  // Reset the chosen area/order whenever the monster selection changes -
  // a previous choice may no longer even be a candidate.
  const idsKey = ids.join(',')
  const [seenIdsKey, setSeenIdsKey] = useState(idsKey)
  if (seenIdsKey !== idsKey) {
    setSeenIdsKey(idsKey)
    setChoice(null)
    setOrder(phoenix ? startingOrder(areas) : [])
  }

  const highest = areas[0]?.monsterIds.length
  const preferred = areas
    .filter((a) => a.monsterIds.length === highest)
    .slice()
    .sort((a, b) => {
      const score = (area: FarmingArea) =>
        waypoint && area.map === waypoint.map && area.x === waypoint.x && area.y === waypoint.y
          ? -1
          : character && area.map === character.map
            ? Math.hypot(area.x - character.x, area.y - character.y)
            : Number.MAX_SAFE_INTEGER
      return score(a) - score(b)
    })[0]
  const selected = choice === null ? preferred : areas.find((a) => a.id === choice)

  const group = (a: FarmingArea): string =>
    ids.length === 1
      ? 'Spawn areas'
      : a.monsterIds.length === ids.length
        ? 'Shared by all selected monsters'
        : a.monsterIds.length > 1
          ? `Shared by ${a.monsterIds.length} selected monsters`
          : choiceFor(a.monsterIds[0])?.name || a.monsterIds[0]

  // The dashboard's pickers list monsterChoices (name · id with sprite).
  const choiceFor = (id: string) => (catalog as unknown as MonsterChoiceEntry[]).find((entry) => entry.id === id) ?? bestiaryCatalog.find((m) => m.id === id)
  const query = search.trim().toLowerCase()
  const monsterOptions = preparation
    ? (catalog as unknown as MonsterChoiceEntry[]).filter((m) => `${m.name ?? ''} ${m.id}`.toLowerCase().includes(query))
    : []

  return (
    <div className="mt-2 rounded-md border border-border p-2">
      <p className="mb-1 text-sm font-medium">{phoenix ? 'Choose Phoenix search order' : preparation ? 'Getting ready to hunt' : 'Choose a farming area'}</p>
      <p className="mb-2 text-xs text-muted-foreground">
        {phoenix
          ? 'Select all five regions in the order to search. Tap a selected region to remove it. Starting selects Phoenix alone.'
          : preparation
            ? 'Select backup farming monsters and an area. Hunt will return here when it ends.'
            : override
              ? 'Starting selects this monster, switches farming to Auto, leaves the current combat event, and starts a party convoy.'
              : 'Choose a waypoint for the selected monsters. Your monster selections and hunt radius stay the same.'}
      </p>

      {preparation && onIdsChange && (
        <div className="mb-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search monsters..." className="mb-2" />
          <div className="max-h-40 overflow-y-auto">
            {monsterOptions.map((monster) => (
              <label key={monster.id} className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  checked={ids.includes(monster.id)}
                  onChange={() => onIdsChange(ids.includes(monster.id) ? ids.filter((x) => x !== monster.id) : [...ids, monster.id])}
                  className="size-4"
                />
                <SpriteIcon sprite={monster.sprite} size={24} />
                <span className="text-sm">{`${monster.name ?? monster.id} · ${monster.id}`}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {phoenix && (
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setOrder([])} className="mb-2">
          Clear order ({order.length}/5)
        </Button>
      )}

      <div className="max-h-64 overflow-y-auto">
        {!areas.length && (
          <div className="space-y-3">
            <p className="text-sm text-amber-500">No ordinary hunt routes available for these monsters.</p>
            {ids.map((id) => (
              <div key={id}>
                <p className="mb-1 font-semibold">{choiceFor(id)?.name || id}</p>
                <MonsterSpawns records={(choiceFor(id) as MonsterChoiceEntry | undefined)?.spawnRecords} />
              </div>
            ))}
          </div>
        )}
        {areas.map((area, index) => {
          const isSelected = phoenix ? order.includes(area.id) : selected?.id === area.id
          return (
            <div key={area.id}>
              {(!index || group(areas[index - 1]) !== group(area)) && <p className="mb-1 mt-2 text-xs font-semibold text-muted-foreground">{group(area)}</p>}
              <button
                type="button"
                disabled={busy}
                aria-pressed={isSelected}
                onClick={() => {
                  setChoice(area.id)
                  setError(null)
                  if (phoenix) setOrder((current) => (current.includes(area.id) ? current.filter((id) => id !== area.id) : [...current, area.id]))
                }}
                className={`relative mb-1.5 block w-full rounded-md border p-2.5 pr-10 text-left text-sm ${isSelected ? 'border-primary bg-primary/10' : 'border-border'}`}
              >
                {phoenix && order.includes(area.id) && (
                  <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full border border-primary bg-primary/20 text-xs font-bold">
                    {order.indexOf(area.id) + 1}
                  </span>
                )}
                <p className="font-medium">
                  {area.mapName || area.map} <span className="font-mono text-xs text-muted-foreground">({Math.round(area.x)}, {Math.round(area.y)})</span>
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {area.monsterIds.map((id) => {
                    const monster = choiceFor(id)
                    return (
                      <span key={id} className="flex items-center gap-1 text-xs text-muted-foreground">
                        <SpriteIcon sprite={monster?.sprite} size={18} />
                        {monster?.name || id}
                      </span>
                    )
                  })}
                </div>
              </button>
            </div>
          )
        })}
      </div>
      {!phoenix && selected && <p className="mt-1 text-xs text-muted-foreground">Hunt radius: {radius}</p>}
      {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={busy || (phoenix ? order.length !== 5 : !selected)}
          onClick={async () => {
            const starting = phoenix ? areas.find((a) => a.id === order[0]) : selected
            if (!starting) return
            setError(null)
            try {
              await onStart(starting, phoenix ? order : undefined)
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Farming route failed')
            }
          }}
        >
          {busy ? 'Starting…' : phoenix ? 'Start Phoenix patrol' : preparation ? 'Save backup and start Hunt' : 'Start farming'}
        </Button>
      </div>
    </div>
  )
}
