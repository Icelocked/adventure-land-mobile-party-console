import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SpriteIcon } from '@/components/SpriteIcon'
import { farmingAreas, defaultPhoenixOrder, type FarmingArea } from '@/lib/farmingAreas'
import type { Catalog } from '@/lib/farmingZones'
import type { BestiaryMonster } from '@/models'

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
        character && area.map === character.map ? Math.hypot(area.x - character.x, area.y - character.y) : Number.MAX_SAFE_INTEGER
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
          : bestiaryCatalog.find((m) => m.id === a.monsterIds[0])?.name || a.monsterIds[0]

  const monsterOptions = preparation
    ? bestiaryCatalog.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
    : []

  return (
    <div className="mt-2 rounded-md border border-border p-2">
      <p className="mb-1 text-sm font-medium">{phoenix ? 'Choose Phoenix search order' : preparation ? 'Getting ready to hunt' : 'Choose a farming area'}</p>
      <p className="mb-2 text-xs text-muted-foreground">
        {phoenix
          ? 'Select all five regions in the order to search. Tap a selected region to remove it.'
          : preparation
            ? 'Select backup farming monsters and an area. Hunt will return here when it ends.'
            : 'Choose a waypoint for the selected monsters.'}
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
                <span className="text-sm">{monster.name}</span>
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
          <p className="text-xs text-muted-foreground">No known spawn locations for the selected monsters.</p>
        )}
        {areas.map((area, index) => {
          const isSelected = phoenix ? order.includes(area.id) : selected?.id === area.id
          return (
            <div key={area.id}>
              {(!index || group(areas[index - 1]) !== group(area)) && <p className="mb-1 mt-2 text-xs font-semibold text-muted-foreground">{group(area)}</p>}
              <button
                type="button"
                disabled={busy}
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
                    const monster = bestiaryCatalog.find((m) => m.id === id)
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
