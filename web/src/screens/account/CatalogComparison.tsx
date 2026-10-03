import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { SpriteIcon } from '@/components/SpriteIcon'
import { ITEM_DETAIL_PROPERTY_RANK, STAT_SCROLLS, itemMaximumLevel, propertiesAtLevel } from '@/lib/itemFormulas'
import type { CatalogComparisonEntry } from '@/lib/catalogComparison'

/** catalog-comparison.tsx CatalogComparison: item A as the baseline and up
 *  to three alternatives, each with a preview level and stat scroll. */
export function CatalogComparison({
  entries,
  onChange,
  onRemove,
}: {
  entries: CatalogComparisonEntry[]
  onChange: (index: number, value: CatalogComparisonEntry) => void
  onRemove: (index: number) => void
}) {
  const properties = entries.map(({ entry, level, stat }) => propertiesAtLevel(entry.meta || undefined, entry.item, level, stat || null) as Record<string, unknown>)
  // Ability parameters describe different effects; keep them with their named ability.
  const keys = [...new Set(properties.flatMap(Object.keys))]
    .filter((key) => !['level', 'attr0', 'attr1'].includes(key) && properties.some((props) => typeof props[key] === 'number' && Number.isFinite(props[key]) && props[key] !== 0))
    .sort((a, b) => (ITEM_DETAIL_PROPERTY_RANK.get(a) ?? 999) - (ITEM_DETAIL_PROPERTY_RANK.get(b) ?? 999) || a.localeCompare(b))
  const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 3 })
  return (
    <div className="min-h-0 overflow-auto rounded border border-cyan-800">
      <table className="w-full border-collapse text-sm">
        <caption className="p-3 text-left text-slate-300">Item stats only. Every difference is against A; character bonuses and passive damage are not included.</caption>
        <thead>
          <tr>
            <th scope="col" className="min-w-24 p-3 text-left">
              Stat
            </th>
            {entries.map((value, index) => {
              const { entry, level, stat } = value
              const name = String(entry.meta?.definition.name || entry.item.name)
              const label = String.fromCharCode(65 + index)
              return (
                <th scope="col" key={index} className="min-w-44 border-l border-cyan-900 p-3 text-left align-top font-normal">
                  <p className="mb-2 font-semibold text-cyan-200">
                    {label}
                    {index === 0 ? ' · Baseline' : ' · vs A'}
                  </p>
                  <SpriteIcon sprite={entry.meta?.sprite} size={48} className="mb-2" />
                  <p className="mb-3 font-semibold">{name}</p>
                  {entry.meta?.upgradeable || entry.meta?.compoundable ? (
                    <div className="mb-4 rounded border border-violet-900 p-3">
                      <div className="mb-2 flex justify-between font-mono text-xs uppercase text-violet-300">
                        <span>Preview level</span>
                        <span>+{level}</span>
                      </div>
                      <Slider
                        aria-label={`${label} ${name} preview level`}
                        min={0}
                        max={Math.max(Number(entry.item.level) || 0, itemMaximumLevel(entry.meta || undefined))}
                        step={1}
                        value={level}
                        onValueChange={(nextLevel) => onChange(index, { ...value, level: typeof nextLevel === 'number' ? nextLevel : nextLevel[0] || 0 })}
                      />
                    </div>
                  ) : null}
                  {!!entry.meta?.definition.stat && (
                    <select
                      aria-label={`${label} ${name} stat scroll`}
                      value={stat}
                      onChange={(event) => onChange(index, { ...value, stat: event.target.value })}
                      className="mt-2 w-full rounded border border-cyan-700 bg-background p-2"
                    >
                      <option value="">No stat scroll</option>
                      {STAT_SCROLLS.map((choice) => (
                        <option key={choice.stat} value={choice.stat}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {index > 0 && (
                    <Button size="sm" variant="outline" aria-label={`Remove ${label} ${name}`} className="mt-2 border-cyan-700" onClick={() => onRemove(index)}>
                      Remove
                    </Button>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {['type', 'wtype', 'damage_type', 'ability']
            .filter((key) => entries.some(({ entry }) => entry.meta?.definition[key]))
            .map((key) => (
              <tr key={key} className="border-t border-cyan-900">
                <th scope="row" className="p-3 text-left font-normal capitalize text-slate-300">
                  {key.replaceAll('_', ' ')}
                </th>
                {entries.map(({ entry }, index) => (
                  <td key={index} className="border-l border-cyan-900 p-3">
                    {String(entry.meta?.definition[key] || '—')}
                    {key === 'ability' &&
                      !!entry.meta?.definition.ability &&
                      ['attr0', 'attr1'].map((attr) =>
                        typeof properties[index][attr] === 'number' ? (
                          <span key={attr} className="ml-2 text-cyan-200">
                            {attr === 'attr0' ? 'Value' : 'Secondary value'}: {format(Number(properties[index][attr]))}
                          </span>
                        ) : null,
                      )}
                  </td>
                ))}
              </tr>
            ))}
          {keys.map((key) => (
            <tr key={key} className="border-t border-cyan-900">
              <th scope="row" className="p-3 text-left font-normal capitalize text-slate-300">
                {key.replaceAll('_', ' ')}
              </th>
              {properties.map((props, index) => {
                const value = Number(props[key]) || 0
                const baseline = Number(properties[0][key]) || 0
                const delta = value - baseline
                return (
                  <td key={index} className="border-l border-cyan-900 p-3 font-mono">
                    {format(value)}
                    {index > 0 && (
                      <span className="ml-2 text-cyan-200">
                        ({delta > 0 ? '+' : ''}
                        {format(delta)}
                        {baseline !== 0 ? ` · ${delta > 0 ? '+' : ''}${format((delta / Math.abs(baseline)) * 100)}%` : ''})
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
