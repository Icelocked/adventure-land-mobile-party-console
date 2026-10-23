import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { emptyMarketFilter, type MarketFilter, type MarketSort } from '@/lib/marketFilter'

const sorts: readonly MarketSort[] = ['newest', 'price', 'level']
const numberField = (value: string) => (value.trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value))
const fields = [
  ['minLevel', 'Minimum level', 'Level from'],
  ['maxLevel', 'Maximum level', 'Level to'],
  ['minPrice', 'Minimum price', 'Price from'],
  ['maxPrice', 'Maximum price', 'Price to'],
  ['minTier', 'Minimum tier', 'Tier from'],
  ['maxTier', 'Maximum tier', 'Tier to'],
] as const

/** `servers` lists the realms in the tab's data (serverOptions); All is always first. */
export function MarketFilterBar({ filter, onChange, servers = [] }: { filter: MarketFilter; onChange: (next: MarketFilter) => void; servers?: readonly string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Input aria-label="Keywords" placeholder="Keywords" value={filter.keywords} onChange={(event) => onChange({ ...filter, keywords: event.target.value })} className="h-8 w-40" />
      {fields.map(([field, label, placeholder]) => (
        <Input
          key={field}
          aria-label={label}
          placeholder={placeholder}
          type="number"
          value={filter[field] ?? ''}
          onChange={(event) => onChange({ ...filter, [field]: numberField(event.target.value) })}
          className="h-8 w-24"
        />
      ))}
      <select aria-label="Server" value={filter.server ?? ''} onChange={(event) => onChange({ ...filter, server: event.target.value || null })} className="h-8 rounded border border-border bg-background px-2">
        <option value="">All servers</option>
        {servers.map((server) => (
          <option key={server} value={server}>
            {server}
          </option>
        ))}
      </select>
      <select
        aria-label="Sort market"
        value={filter.sort}
        onChange={(event) => onChange({ ...filter, sort: sorts.find((sort) => sort === event.target.value) ?? 'newest' })}
        className="h-8 rounded border border-border bg-background px-2"
      >
        <option value="newest">Newest listed</option>
        <option value="price">Price, low to high</option>
        <option value="level">Level, high to low</option>
      </select>
      <Button size="sm" variant="outline" onClick={() => onChange(emptyMarketFilter)}>
        Clear filter
      </Button>
    </div>
  )
}
