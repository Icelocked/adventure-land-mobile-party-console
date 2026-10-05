import { durationStat } from '@/lib/itemFormulas'
import { displayValue } from '@/lib/statusDuration'

export function DefinitionGrid({ value, omit = [] }: { value: Record<string, unknown>; omit?: string[] }) {
  const hidden = new Set(omit)
  const entries = Object.entries(value || {}).filter(([key, field]) => !hidden.has(key) && field !== undefined && field !== null && field !== '')
  const display = (field: unknown) => {
    if (typeof field === 'boolean') return field ? 'Yes' : 'No'
    if (typeof field === 'object') return JSON.stringify(field)
    return displayValue(field)
  }
  return (
    <dl className="grid gap-x-5 gap-y-1">
      {entries.map(([key, field]) => (
        <div key={key} className="flex min-w-0 justify-between gap-3 border-b border-border py-1.5 text-xs">
          <dt className="shrink-0 capitalize text-muted-foreground">{key.replaceAll('_', ' ')}</dt>
          <dd className="min-w-0 break-words text-right font-mono text-emerald-200">
            {(typeof field === 'number' ? durationStat(key, field, typeof value.type === 'string' ? value.type : undefined) : null) ?? display(field)}
          </dd>
        </div>
      ))}
    </dl>
  )
}
