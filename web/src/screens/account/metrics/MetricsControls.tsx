import { useState, type ReactNode } from 'react'
import { ListFilter, Search } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export const metricsControl =
  'inline-flex h-9 min-w-0 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40'

export function MetricsSelect({ label, value, onChange, options, className }: {
  label: string; value: string; onChange(value: string): void
  options: { value: string; label: string; disabled?: boolean }[]; className?: string
}) {
  return (
    <select aria-label={label} className={cn(metricsControl, 'max-w-44 truncate', className)} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>
      ))}
    </select>
  )
}

/** A searchable checkbox list behind one button, as metrics-filter.tsx does. */
export function MetricsFilter({ label, allLabel, selected, options, onChange, icon }: {
  label: string; allLabel: string; selected: string[]; options: { id: string; label: string }[]
  onChange(value: string[]): void; icon?: ReactNode
}) {
  const [search, setSearch] = useState('')
  const term = search.trim().toLowerCase()
  return (
    <Popover>
      <PopoverTrigger className={metricsControl} aria-label={label}>
        {icon ?? <ListFilter className="size-4" />}
        {selected.length ? `${selected.length} selected` : allLabel}
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[70vh] w-72 max-w-[calc(100vw-32px)] overflow-y-auto">
        {options.length > 8 && (
          <div className="flex items-center gap-2 rounded-md border border-border px-2">
            <Search className="size-4 text-muted-foreground" />
            <input aria-label={`Search ${label.toLowerCase()}`} className="h-9 min-w-0 flex-1 bg-transparent outline-none" placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        )}
        <button className={cn(metricsControl, 'w-full')} onClick={() => onChange([])}>{allLabel}</button>
        <div className="max-h-64 overflow-y-auto">
          {options
            .filter((option) => `${option.label} ${option.id}`.toLowerCase().includes(term))
            .map((option) => (
              <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-accent">
                <input
                  type="checkbox"
                  checked={selected.includes(option.id)}
                  onChange={() => onChange(selected.includes(option.id) ? selected.filter((id) => id !== option.id) : [...selected, option.id])}
                />
                {option.label}
              </label>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
