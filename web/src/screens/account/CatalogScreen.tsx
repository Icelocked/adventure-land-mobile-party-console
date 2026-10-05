import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ItemDetailBrowser } from '@/screens/itemdetail/ItemDetailBrowser'
import { EQUIPMENT_TYPES, comparisonEntry, type CatalogComparisonEntry, type ComparisonSource } from '@/lib/catalogComparison'
import { AccountScreenScaffold } from './AccountScreenScaffold'
import { CatalogComparison } from './CatalogComparison'
import type { CatalogItem } from '@/models'

// Rows render in bounded batches as the list scrolls.
const ROW_BATCH = 120

const SORTS = [
  ['tier', 'Tier'],
  ['name', 'Name'],
  ['set', 'Set'],
  ['value', 'Default value'],
  ['attack', 'Attack'],
  ['armor', 'Armor'],
  ['resistance', 'Resistance'],
  ['stat', 'Stat'],
  ['str', 'STR'],
  ['int', 'INT'],
  ['dex', 'DEX'],
  ['vit', 'VIT'],
  ['speed', 'Speed'],
  ['frequency', 'Attack speed'],
  ['range', 'Range'],
  ['apiercing', 'Armor piercing'],
  ['rpiercing', 'Resistance piercing'],
  ['pnresistance', 'Poison resistance'],
  ['firesistance', 'Fire resistance'],
  ['fzresistance', 'Freeze resistance'],
  ['phresistance', 'Physical resistance'],
  ['stresistance', 'Status resistance'],
  ['evasion', 'Evasion'],
  ['crit', 'Critical'],
  ['luck', 'Luck'],
]

const chip = (selected: boolean) => `rounded-full border px-3 py-1 text-xs ${selected ? 'border-cyan-400 bg-cyan-950 text-cyan-100' : 'border-slate-600 text-slate-200'}`

/** Equipment catalog. Opened with a comparison source (item details' "From catalog"),
 *  it collects up to three alternatives and shows the catalog comparison. */
export function CatalogScreen() {
  const state = useDynamicState()
  const refreshNow = useRefreshDynamicStateNow()
  const location = useLocation()
  const navigate = useNavigate()
  const source = (location.state as { comparison?: ComparisonSource } | null)?.comparison ?? null
  const catalog = useMemo(() => state.merchantCatalog?.allItems ?? [], [state.merchantCatalog])
  const [search, setSearch] = useState('')
  const [types, setTypes] = useState<string[]>(() => {
    const type = String(source?.meta?.definition.type || '')
    return type ? [type] : []
  })
  const [selectedClasses, setSelectedClasses] = useState<string[]>([])
  const [exclusiveGear, setExclusiveGear] = useState(false)
  const [sort, setSort] = useState('tier')
  const [inspecting, setInspecting] = useState<CatalogItem | null>(null)
  const [entries, setEntries] = useState<CatalogComparisonEntry[]>(() => (source ? [comparisonEntry(source)] : []))
  const [viewComparison, setViewComparison] = useState(false)
  // A new comparison source restarts the comparison.
  const [previousSource, setPreviousSource] = useState(source)
  if (previousSource !== source) {
    setPreviousSource(source)
    // The item details close as the comparison starts.
    setInspecting(null)
    setEntries(source ? [comparisonEntry(source)] : [])
    setViewComparison(false)
    if (source) {
      const type = String(source.meta?.definition.type || '')
      setTypes(type ? [type] : [])
      setSearch('')
      setSelectedClasses([])
      setExclusiveGear(false)
    }
  }
  const equipment = useMemo(() => catalog.filter((item) => EQUIPMENT_TYPES.includes(String(item.meta?.definition.type || ''))), [catalog])
  const availableTypes = useMemo(() => [...new Set(equipment.map((item) => String(item.meta?.definition.type || '')))].sort(), [equipment])
  const availableClasses = useMemo(
    () => [...new Map(equipment.flatMap((item) => (item.meta?.usage?.classes || []).map((entry) => [entry.id, entry.name] as const))).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [equipment],
  )
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const value = (item: CatalogItem, key: string) => Number(item.meta?.properties?.[key] ?? item.meta?.definition[key] ?? 0)
    return equipment
      .filter(
        (item) =>
          (!query || `${item.name} ${item.id} ${String(item.meta?.definition.set || '')}`.toLowerCase().includes(query)) &&
          (!types.length || types.includes(String(item.meta?.definition.type || ''))) &&
          (!selectedClasses.length ||
            (() => {
              const eligible = new Set((item.meta?.usage?.classes || []).map((entry) => entry.id))
              return selectedClasses.every((id) => eligible.has(id)) && (!exclusiveGear || eligible.size === selectedClasses.length)
            })()),
      )
      .sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name)
        if (sort === 'set') return String(a.meta?.definition.set || 'zzz').localeCompare(String(b.meta?.definition.set || 'zzz')) || a.name.localeCompare(b.name)
        if (sort === 'value') return value(b, 'g') - value(a, 'g') || a.name.localeCompare(b.name)
        if (sort === 'tier') return value(b, 'tier') - value(a, 'tier') || a.name.localeCompare(b.name)
        return value(b, sort) - value(a, sort) || a.name.localeCompare(b.name)
      })
  }, [equipment, search, sort, types, selectedClasses, exclusiveGear])
  const [visibleCount, setVisibleCount] = useState(ROW_BATCH)
  const [previousRows, setPreviousRows] = useState(rows)
  if (previousRows !== rows) {
    setPreviousRows(rows)
    setVisibleCount(ROW_BATCH)
  }
  const visibleRows = rows.slice(0, visibleCount)
  // The page scrolls here, not a dialog body: append a batch near the bottom.
  useEffect(() => {
    const onScroll = () => {
      const remaining = document.documentElement.scrollHeight - window.scrollY - window.innerHeight
      if (remaining <= 400) setVisibleCount((count) => (count < rows.length ? Math.min(count + ROW_BATCH, rows.length) : count))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [rows.length])
  const comparing = !!source && entries.length > 0
  const selectedIds = entries.slice(1).map(({ entry }) => entry.item.name)
  const cancelComparison = () => navigate('/catalog', { replace: true, state: null })
  const sourceName = source ? String(source.meta?.definition.name || source.item.name) : ''

  if (comparing && viewComparison)
    return (
      <AccountScreenScaffold title="Compare catalog items">
        <div className="flex flex-col gap-3 p-3">
          <p className="text-xs text-slate-300">Compare up to three alternatives against item A.</p>
          <div>
            <Button variant="outline" className="border-cyan-700" onClick={() => setViewComparison(false)}>
              Back to catalog · {Math.max(0, entries.length - 1)}/3 selected
            </Button>
          </div>
          <CatalogComparison
            entries={entries}
            onChange={(index, value) => setEntries((previous) => previous.map((entry, i) => (i === index ? value : entry)))}
            onRemove={(index) => setEntries((previous) => previous.filter((_, i) => i !== index))}
          />
        </div>
      </AccountScreenScaffold>
    )

  return (
    <AccountScreenScaffold title="Equipment catalog" onRefresh={() => void refreshNow()}>
      <div className="flex flex-col gap-3 p-3">
        <p className="text-xs text-muted-foreground">Every equippable item in the current game data. Click an item for its full details and WTB action.</p>
        {comparing && (
          <div role="group" aria-label="Catalog comparison" className="flex flex-wrap items-center gap-2 rounded border border-cyan-700 p-3 text-sm">
            <span className="mr-auto">
              A: {sourceName} +{entries[0].level}
            </span>
            <output>{entries.length - 1}/3 selected</output>
            {entries.slice(1).map(({ entry }, index) => (
              <Button
                key={entry.item.name}
                size="sm"
                variant="outline"
                className="border-cyan-700"
                aria-label={`Remove ${String(entry.meta?.definition.name || entry.item.name)}`}
                onClick={() => setEntries((previous) => previous.filter((_, i) => i !== index + 1))}
              >
                {String.fromCharCode(66 + index)}: {String(entry.meta?.definition.name || entry.item.name)} ×
              </Button>
            ))}
            <Button variant="outline" className="border-cyan-700" disabled={entries.length < 2} onClick={() => setViewComparison(true)}>
              Compare selected
            </Button>
            <Button variant="outline" className="border-cyan-700" onClick={cancelComparison}>
              Cancel comparison
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search equipment, ID, or set…" className="flex-1" />
          <select aria-label="Sort equipment" value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-md border border-border bg-background px-2 text-sm">
            {SORTS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div role="group" aria-label="Equipment types" className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={!types.length} onClick={() => setTypes([])} className={chip(!types.length)}>
            All
          </button>
          {availableTypes.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={types.includes(type)}
              onClick={() => setTypes((old) => (old.includes(type) ? old.filter((entry) => entry !== type) : [...old, type]))}
              className={chip(types.includes(type))}
            >
              {type.replaceAll('_', ' ')}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <fieldset aria-label="Usable by every selected class" className="flex flex-wrap gap-1.5">
            <button type="button" aria-pressed={!selectedClasses.length} onClick={() => setSelectedClasses([])} className={chip(!selectedClasses.length)}>
              All classes
            </button>
            {availableClasses.map(([id, name]) => (
              <button
                key={id}
                type="button"
                aria-pressed={selectedClasses.includes(id)}
                onClick={() => setSelectedClasses((previous) => (previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id]))}
                className={chip(selectedClasses.includes(id))}
              >
                {name}
              </button>
            ))}
          </fieldset>
          <label
            title={selectedClasses.length ? 'Only gear usable by exactly the selected classes' : 'Select classes to filter exclusive gear'}
            className="ml-auto flex shrink-0 items-center gap-2 rounded border border-slate-600 px-3 py-2 text-sm text-cyan-100"
          >
            <input type="checkbox" checked={exclusiveGear} disabled={!selectedClasses.length} onChange={(event) => setExclusiveGear(event.target.checked)} />
            Exclusive gear
          </label>
        </div>
        <p className="font-mono text-[10px] uppercase text-cyan-200/55">
          {visibleRows.length === rows.length ? `${rows.length} item${rows.length === 1 ? '' : 's'}` : `Showing ${visibleRows.length} of ${rows.length} items`} · sorted by {SORTS.find(([id]) => id === sort)?.[1]}
          {selectedClasses.length ? (exclusiveGear ? ' · usable only by the selected classes' : ' · usable by every selected class') : ''}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {visibleRows.map((item) => {
            const def = item.meta?.definition || {},
              primary = sort !== 'tier' && !['name', 'set', 'value'].includes(sort) ? Number(item.meta?.properties?.[sort] ?? def[sort] ?? 0) : null
            return (
              <div key={item.id} className="flex min-w-0 flex-col gap-1">
                <button type="button" onClick={() => setInspecting(item)} className="min-w-0 flex-1 rounded border border-cyan-950 p-2 text-center">
                  <SpriteIcon sprite={item.sprite} size={48} className="mx-auto" />
                  <p className="mt-1 truncate text-xs font-semibold">{item.name}</p>
                  <p className="font-mono text-[9px] uppercase text-cyan-100/45">
                    {String(def.type || '')} · T{Number(def.tier) || 0}
                  </p>
                  {def.set ? <p className="truncate font-mono text-[9px] text-violet-300">{String(def.set)}</p> : null}
                  {primary !== null ? (
                    <p className="font-mono text-[10px] text-amber-300">
                      {sort.toUpperCase()} {primary}
                    </p>
                  ) : null}
                </button>
                {comparing && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedIds.includes(item.id) || selectedIds.length >= 3}
                    onClick={() =>
                      setEntries((previous) =>
                        previous.length >= 4 || previous.slice(1).some(({ entry }) => entry.item.name === item.id) ? previous : [...previous, comparisonEntry({ slot: -1, item: { name: item.id }, meta: item.meta })],
                      )
                    }
                    className="h-auto whitespace-normal border-cyan-700 px-1 py-2 text-xs"
                  >
                    {selectedIds.includes(item.id) ? 'Added to compare' : 'Add to compare'}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {inspecting && (
        <Sheet open onOpenChange={(open) => !open && setInspecting(null)}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
            <ItemDetailBrowser rootItemId={inspecting.id} rootLevel={0} catalog={state.merchantCatalog} monsters={state.bestiaryCatalog} context={{ character: 'Equipment catalog', slot: -1 }} className="pt-2" />
          </SheetContent>
        </Sheet>
      )}
    </AccountScreenScaffold>
  )
}
