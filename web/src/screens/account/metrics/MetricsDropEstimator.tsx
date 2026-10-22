import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useCharacters } from '@/data/PartyDataProvider'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { SpriteIcon } from '@/components/SpriteIcon'
import { effectiveDropRate } from '@/lib/itemFormulas'
import { encouragementLuck, metricFormat, observedMonsterRate, projectDirectDrop, selectMetricRows, type GraphPoint, type MetricsResponse } from '@/lib/metrics'
import type { CatalogItem } from '@/models'
import { MetricsChart } from './MetricsChart'
import { MetricsSelect, metricsControl } from './MetricsControls'
import { cn } from '@/lib/utils'

const normalize = (value: string) => value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_-]/g, ' ').trim()

/** metrics-item-picker.tsx as a sheet: name, id, set or type tokens all have to match. */
function ItemPicker({ items, value, onChange }: { items: CatalogItem[]; value: string; onChange(id: string): void }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('')
  const selected = items.find((item) => item.id === value)
  const results = useMemo(() => {
    const search = normalize(query), tokens = search.split(/\s+/).filter(Boolean)
    const rank = (item: CatalogItem) => (normalize(item.name) === search || normalize(item.id) === search ? 2 : normalize(item.name).startsWith(search) ? 1 : 0)
    return items
      .filter((item) => { const text = normalize(`${item.name} ${item.id} ${item.meta?.definition?.set || ''} ${item.meta?.definition?.type || ''}`); return tokens.every((token) => text.includes(token)) })
      .sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name))
      .slice(0, 100)
  }, [items, query])
  return (
    <>
      <button className={cn(metricsControl, 'w-44 justify-start')} aria-label="Choose drop item" onClick={() => setOpen(true)}>
        {selected?.sprite ? <SpriteIcon sprite={selected.sprite} size={20} /> : <Search className="size-4 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate text-left">{selected?.name || 'Search items'}</span>
      </button>
      <Sheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery('') }}>
        <SheetContent side="bottom" className="max-h-[85vh] p-4">
          <SheetTitle>Choose drop item</SheetTitle>
          <input aria-label="Search drop items" autoFocus className={cn(metricsControl, 'w-full justify-start')} placeholder="Search name, ID, set or type" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {results.length === 0 && <p className="p-4 text-center text-muted-foreground">No items found</p>}
            {results.map((item) => (
              <button key={item.id} className={cn('flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent', item.id === value && 'bg-accent')}
                onClick={() => { onChange(item.id); setOpen(false); setQuery('') }}>
                <span className="grid size-8 shrink-0 place-items-center rounded border border-border">{item.sprite && <SpriteIcon sprite={item.sprite} size={24} />}</span>
                <span className="min-w-0 flex-1"><span className="block truncate">{item.name}</span><span className="block truncate text-xs text-muted-foreground">{item.id}</span></span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

/** metrics-drop-estimator.tsx: the chance of at least one direct monster drop over kills or hours. */
export function MetricsDropEstimator({ data, items: allItems, characters, server, live, clock }: {
  data: MetricsResponse; items: CatalogItem[]; characters: string[]; server: string; live: boolean; clock: number
}) {
  const liveCharacters = useCharacters()
  const [itemId, setItemId] = useState(''), [sourceIndex, setSourceIndex] = useState(0)
  const [rateOverride, setRateOverride] = useState(''), [luckOverride, setLuckOverride] = useState(''), [luckCharacter, setLuckCharacter] = useState('')
  const [share, setShare] = useState('1'), [level, setLevel] = useState('1'), [multiplier, setMultiplier] = useState('1'), [rolls, setRolls] = useState('1')
  const [contributionOverride, setContributionOverride] = useState(''), [encouragementOverride, setEncouragementOverride] = useState('')
  const [hours, setHours] = useState(false), [target, setTarget] = useState('95')
  function reset() {
    setItemId(''); setSourceIndex(0); setRateOverride(''); setLuckOverride(''); setLuckCharacter('')
    setShare('1'); setLevel('1'); setMultiplier('1'); setRolls('1'); setContributionOverride('')
    setEncouragementOverride(''); setHours(false); setTarget('95')
  }
  const items = useMemo(() => allItems.filter((item) => item.meta?.world?.drops?.length), [allItems])
  const selected = items.find((item) => item.id === itemId), sources = selected?.meta?.world?.drops || [], source = sources[sourceIndex]
  const direct = !!source && source.sourceType === 'monster' && (source.acquisitionPath?.length || 0) <= 1
  const baseRate = source ? effectiveDropRate(source) : 0, supported = direct && baseRate > 0 && baseRate <= 1
  const rows = selectMetricRows(data.points.flatMap((point) => point.values), characters, server)
  const participants = new Map<string, number>()
  for (const row of rows) {
    const credits = row.credits.filter((credit) => credit.monster === source?.monsterId).reduce((total, credit) => total + credit.count, 0)
    if (credits) participants.set(row.character, (participants.get(row.character) || 0) + credits)
  }
  const selectedName = luckCharacter || [...participants].sort((a, b) => b[1] - a[1])[0]?.[0] || rows[0]?.character || ''
  const latest = rows.filter((row) => row.character === selectedName).sort((a, b) => b.last.at - a.last.at)[0]
  const conditions = liveCharacters[selectedName]?.vitals?.conditions
  const currentBuffs = live && conditions ? encouragementLuck(Object.fromEntries(conditions.map((condition) => [condition.id, condition.live]))) : null
  const fresh = latest && clock - latest.last.at < 30_000
  const nativeEncouragement = fresh && currentBuffs !== null ? currentBuffs : latest?.last.encouragementLuck ?? 1
  const encouragement = encouragementOverride === '' ? nativeEncouragement : Number(encouragementOverride)
  const monsterDamage = selectMetricRows(data.points.flatMap((point) => point.values), [], server)
    .flatMap((row) => row.damage.filter((hit) => hit.monster === source?.monsterId).map((hit) => ({ character: row.character, amount: hit.amount })))
  const totalDamage = monsterDamage.reduce((total, hit) => total + hit.amount, 0)
  const ownDamage = monsterDamage.filter((hit) => hit.character === selectedName).reduce((total, hit) => total + hit.amount, 0)
  const observedContribution = totalDamage > 0 ? Math.min(1, ownDamage / totalDamage) : 1
  const contribution = contributionOverride === '' ? observedContribution : Number(contributionOverride) / 100
  const luck = luckOverride === '' ? latest?.last.luck ?? null : Number(luckOverride)
  const observed = source ? observedMonsterRate(data, source.monsterId, server, characters) : null
  const rate = rateOverride === '' ? observed : Number(rateOverride)
  const rollCount = Number(rolls), shareValue = Number(share), levelValue = Number(level), modifierValue = Number(multiplier)
  const valid = luck !== null && Number.isFinite(luck) && luck > 0 && shareValue > 0 && shareValue <= 1 &&
    Number.isFinite(levelValue) && levelValue >= 1 && Number.isFinite(modifierValue) && modifierValue > 0 &&
    Number.isInteger(rollCount) && rollCount >= 1 && rollCount <= 100 && Number.isFinite(encouragement) && encouragement >= 1 &&
    Number.isFinite(contribution) && contribution >= 0 && contribution <= 1
  const projection = supported && valid ? projectDirectDrop({ baseRate, luck, share: shareValue, contribution, encouragement, level: levelValue, modifier: modifierValue, rolls: rollCount }) : null
  const probability = projection?.probability ?? null
  const threshold = (q: number) => (probability === null || probability <= 0 ? null : probability === 1 ? 1 : Math.ceil(Math.log1p(-q) / Math.log1p(-probability)))
  const average = probability && probability > 0 ? 1 / probability : null
  const targetValue = Number(target), targetKills = targetValue > 0 && targetValue < 100 ? threshold(targetValue / 100) : null
  const horizon = Math.max(1, threshold(0.99) || 1), rateValid = rate !== null && Number.isFinite(rate) && rate > 0
  const curve: GraphPoint[] = probability === null || (hours && !rateValid) ? [] : Array.from({ length: 201 }, (_, index) => {
    const kills = (horizon * index) / 200
    return { at: hours && rateValid ? kills / rate! : kills, probability: probability === 1 ? (kills >= 1 ? 100 : 0) : -Math.expm1(kills * Math.log1p(-probability)) * 100 }
  })
  function chooseItem(id: string) {
    setItemId(id)
    const next = items.find((item) => item.id === id)?.meta?.world?.drops || []
    setSourceIndex(Math.max(0, next.findIndex((entry) => entry.sourceType === 'monster' && (entry.acquisitionPath?.length || 0) <= 1)))
  }
  const input = (label: string, value: string, change: (value: string) => void, placeholder: string, min = 0, max?: number) => (
    <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">{label}
      <input className={cn(metricsControl, 'w-full justify-start tabular-nums')} type="number" min={min} max={max} step="any" value={value} placeholder={placeholder} onChange={(event) => change(event.target.value)} />
    </label>
  )
  const milestones = [{ label: 'Mean', kills: average }, { label: '50%', kills: threshold(0.5) }, { label: '90%', kills: threshold(0.9) }, { label: target + '%', kills: targetKills }]
  const unit = hours ? 'h' : 'kills'
  return (
    <MetricsChart title="Item drop estimate" data={curve} series={[{ key: 'probability', label: 'At least one drop', color: '#4ade80' }]} onReset={reset} resetTitle="Reset estimate and options" logarithmic logarithmicX
      yLabel="Chance (%)" yDomain={[0, 100]} xFormat={(value) => metricFormat(value) + (hours ? ' h' : ' kills')}
      references={[50, 90, 95].map((value) => ({ value, label: value + '%' }))}
      empty={!selected ? 'Choose an item' : !supported ? 'Unsupported drop source' : !valid ? 'Set luck in options' : hours && !rateValid ? 'Set kills per hour' : 'No drop chance'}
      inlineControls={<>
        <ItemPicker items={items} value={itemId} onChange={chooseItem} />
        <MetricsSelect label="Drop source" className="w-28" value={String(sourceIndex)} onChange={(value) => setSourceIndex(Number(value))}
          options={sources.length ? sources.map((entry, index) => ({ value: String(index), label: entry.monsterName })) : [{ value: '0', label: 'Source' }]} />
        <MetricsSelect label="X-axis unit" className="w-24" value={hours ? 'hours' : 'kills'} onChange={(value) => setHours(value === 'hours')} options={[{ value: 'kills', label: 'Kills' }, { value: 'hours', label: 'Hours', disabled: !rateValid }]} />
      </>}
      footer={
        <div className="grid grid-cols-4 gap-2 border-t border-border pt-2">
          {milestones.map((value, index) => (
            <div key={index} className="min-w-0">
              <span className="block text-xs text-muted-foreground">{value.label}</span>
              <span aria-label={value.label} className="block truncate text-sm font-medium tabular-nums">{value.kills === null ? '-' : `${metricFormat(hours && rateValid ? value.kills / rate! : value.kills)} ${unit}`}</span>
            </div>
          ))}
        </div>
      }
      optionDetails={<>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-border pt-3">
          <label className="col-span-2 grid gap-1 text-xs text-muted-foreground">Luck character
            <MetricsSelect label="Luck character" className="w-full max-w-none" value={luckCharacter} onChange={setLuckCharacter} options={[{ value: '', label: 'Automatic' }, ...data.characters.map((name) => ({ value: name, label: name }))]} />
          </label>
          {input('Kills / hour', rateOverride, setRateOverride, observed ? metricFormat(observed) : 'Auto')}
          {input('Luck (x)', luckOverride, setLuckOverride, latest ? latest.last.luck.toFixed(2) : 'Auto')}
          {input('Encouragement (x)', encouragementOverride, setEncouragementOverride, nativeEncouragement.toFixed(2), 1)}
          {input('Contribution (%)', contributionOverride, setContributionOverride, (observedContribution * 100).toFixed(1), 0, 100)}
          {input('Loot share', share, setShare, '1', 0.001, 1)}
          {input('Monster level', level, setLevel, '1', 1)}
          {input('Monster modifier', multiplier, setMultiplier, '1', 0.001)}
          {input('Ordinary rolls', rolls, setRolls, '1', 1, 100)}
          {input('Target chance (%)', target, setTarget, '95', 1, 99.99)}
          <div className="grid content-center gap-1 text-xs text-muted-foreground"><span>Expected / 1,000 kills</span><span className="text-sm font-medium tabular-nums text-foreground">{projection ? metricFormat(1000 * projection.expectedRewards * (source?.quantity || 1)) : '-'}</span></div>
        </div>
        <p className="text-xs text-muted-foreground">Auto contribution uses tracked damage. Override it for untracked players or healing.</p>
        <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground"><span className="truncate">{selectedName || 'No character'}</span><span className="shrink-0 text-emerald-300">{metricFormat(encouragement)}x Encouragement</span></div>
      </>} />
  )
}
