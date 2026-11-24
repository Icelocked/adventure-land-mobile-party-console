import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GRADE_NAMES, normalize, parseLevel, parsePrice, type MarketFilter } from './marketFilters'

// The Market Filters add-on's bar on a Market tab (console runtime/addons/market-filters/dashboard.tsx).
// The Market keeps its own search box, so the bar holds only the level, price, server and tier
// bounds and the Newest first order.

interface Drafts {
  minLevel: string
  maxLevel: string
  minPrice: string
  maxPrice: string
  server: string
  grade: string
  newest: boolean
}
const EMPTY: Drafts = { minLevel: '', maxLevel: '', minPrice: '', maxPrice: '', server: '', grade: '', newest: false }

const draftsOf = (value: MarketFilter | undefined): Drafts => {
  const held = normalize(value) ?? {}
  const text = (entry: number | undefined) => (entry === undefined ? '' : String(entry))
  return {
    minLevel: text(held.minLevel), maxLevel: text(held.maxLevel), minPrice: text(held.minPrice), maxPrice: text(held.maxPrice),
    server: held.server ?? '', grade: text(held.grade), newest: held.newest ?? false,
  }
}
const valueOf = (drafts: Drafts): MarketFilter | undefined =>
  normalize({
    minLevel: parseLevel(drafts.minLevel), maxLevel: parseLevel(drafts.maxLevel),
    minPrice: parsePrice(drafts.minPrice), maxPrice: parsePrice(drafts.maxPrice),
    server: drafts.server || undefined,
    grade: drafts.grade === '' ? undefined : Number(drafts.grade),
    newest: drafts.newest,
  })

/** `realms` and `tiers` are the tab's own; a list with none draws no choice. The parent keys the bar
 *  by tab, so each tab's boxes start from its own value. */
export function MarketFiltersBar({ value, set, realms, tiers }: { value: MarketFilter | undefined; set: (next: MarketFilter | undefined) => void; realms: readonly string[]; tiers: readonly number[] }) {
  // The boxes keep what the player typed, so a half-typed "1." stays while the value holds the parsed bound.
  const [drafts, setDrafts] = useState<Drafts>(() => draftsOf(value))
  const change = (field: keyof Drafts, text: string | boolean) => {
    const next = { ...drafts, [field]: text }
    setDrafts(next)
    set(valueOf(next))
  }
  const field = (name: 'minLevel' | 'maxLevel' | 'minPrice' | 'maxPrice', label: string, width: string, placeholder: string) => (
    <Input aria-label={label} title={label} value={drafts[name]} placeholder={placeholder} inputMode="decimal" onChange={(event) => change(name, event.target.value)} className={`h-8 ${width}`} />
  )
  return (
    <div data-addon="market-filters" className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">Level</span>
      {field('minLevel', 'Lowest level', 'w-14', 'min')}
      {field('maxLevel', 'Highest level', 'w-14', 'max')}
      <span className="text-muted-foreground">Price</span>
      {field('minPrice', 'Lowest price, such as 250k or 1.5m', 'w-20', 'min')}
      {field('maxPrice', 'Highest price, such as 250k or 1.5m', 'w-20', 'max')}
      {realms.length > 0 && (
        <select aria-label="Server" value={drafts.server} onChange={(event) => change('server', event.target.value)} className="h-8 rounded border border-border bg-background px-2">
          <option value="">Any server</option>
          {realms.map((realm) => (
            <option key={realm} value={realm}>
              {realm}
            </option>
          ))}
        </select>
      )}
      {tiers.length > 0 && (
        <select aria-label="Tier" value={drafts.grade} onChange={(event) => change('grade', event.target.value)} className="h-8 rounded border border-border bg-background px-2">
          <option value="">Any tier</option>
          {tiers.map((grade) => (
            <option key={grade} value={String(grade)}>
              {GRADE_NAMES[grade] ?? `Grade ${grade}`}
            </option>
          ))}
        </select>
      )}
      <Button size="sm" variant={drafts.newest ? 'default' : 'outline'} aria-pressed={drafts.newest} onClick={() => change('newest', !drafts.newest)}>
        Newest first
      </Button>
      {value !== undefined && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setDrafts(EMPTY)
            set(undefined)
          }}
        >
          Clear
        </Button>
      )}
    </div>
  )
}
