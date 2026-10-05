import { useState } from 'react'
import { ArrowDown, ArrowUp, Info } from 'lucide-react'
import { useCharacters, useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { SharedTracktrixBonuses } from '@/components/Tracktrix'
import { MonsterDetail } from '@/components/MonsterDetail'
import { useMonsterAchievements } from '@/data/useMonsterAchievements'
import { ItemDetailBrowser } from '@/screens/itemdetail/ItemDetailBrowser'
import { achievementMilestones } from '@/lib/monsterAchievements'
import { AccountScreenScaffold } from './AccountScreenScaffold'
import type { BestiaryMonster } from '@/models'

const sortOptions = [
  { value: 'threat', label: 'Threat rate' },
  { value: 'hp', label: 'HP' },
  { value: 'attack', label: 'Attack' },
  { value: 'xp', label: 'XP reward' },
  { value: 'range', label: 'Attack range' },
  { value: 'name', label: 'Name' },
  { value: 'tracktrix', label: 'Tracktrix score' },
  { value: 'next', label: 'Score to next' },
]

/** Bestiary: map filter, search, sort with
 *  direction, Tracktrix bonuses and scores; a monster opens its details. */
export function BestiaryScreen() {
  const state = useDynamicState()
  const characters = useCharacters()
  const refreshNow = useRefreshDynamicStateNow()
  const aggregated = useMonsterAchievements()
  const achievements = Object.keys(aggregated).length ? aggregated : null
  const monsters = state.bestiaryCatalog
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('threat')
  const [ascending, setAscending] = useState(true)
  const [selectedMap, setSelectedMap] = useState('all')
  const [bonusesOpen, setBonusesOpen] = useState(false)
  const [inspecting, setInspecting] = useState<BestiaryMonster | null>(null)
  const [drop, setDrop] = useState<string | null>(null)
  // A drop opened from a monster's details.
  const [dropSource, setDropSource] = useState('')
  const maps = [...new Set(monsters.flatMap((monster) => (monster.spawnRecords || []).map((spawn) => spawn.map)))].sort()
  const score = (monster: BestiaryMonster) => Math.max(0, Number(achievements?.[monster.id]?.score) || 0)
  const scoreToNext = (monster: BestiaryMonster) => {
    if (!achievements) return null
    const next = achievementMilestones(monster).find((value) => value > score(monster))
    return next === undefined ? null : next - score(monster)
  }
  const filtered = monsters
    .filter((monster) => selectedMap === 'all' || monster.spawnRecords?.some((spawn) => spawn.map === selectedMap))
    .filter((monster) => `${monster.name} ${monster.id}`.toLowerCase().includes(search.toLowerCase()))
    .slice()
    .sort((a, b) => {
      const direction = ascending ? 1 : -1
      if (sort === 'name') return direction * a.name.localeCompare(b.name)
      if (sort === 'tracktrix') return direction * (score(a) - score(b)) || a.name.localeCompare(b.name)
      if (sort === 'next') {
        const remainingA = scoreToNext(a),
          remainingB = scoreToNext(b)
        if (remainingA === null && remainingB !== null) return 1
        if (remainingB === null && remainingA !== null) return -1
        return direction * ((remainingA ?? 0) - (remainingB ?? 0)) || a.name.localeCompare(b.name)
      }
      const key = sort as 'threat' | 'hp' | 'attack' | 'xp' | 'range'
      return direction * ((a[key] || 0) - (b[key] || 0)) || a.name.localeCompare(b.name)
    })

  return (
    <AccountScreenScaffold title="Bestiary" onRefresh={() => void refreshNow()}>
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-start gap-2">
          <p className="flex-1 text-xs text-muted-foreground">Compare monsters before choosing a farming target. Use the arrow to switch between lowest and highest first.</p>
          <button
            type="button"
            aria-label="Current Tracktrix bonuses"
            aria-expanded={bonusesOpen}
            title="Current Tracktrix bonuses"
            onClick={() => setBonusesOpen(!bonusesOpen)}
            className="rounded border border-rose-700 p-1 text-rose-200"
          >
            <Info aria-hidden="true" className="size-3.5" />
          </button>
        </div>
        {bonusesOpen && <SharedTracktrixBonuses names={Object.keys(characters)} />}
        <fieldset className="space-y-2">
          <legend className="text-sm">Show monsters in</legend>
          <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
            {['all', ...maps].map((map) => (
              <button
                key={map}
                type="button"
                aria-pressed={selectedMap === map}
                onClick={() => setSelectedMap(map)}
                className={`rounded-full border px-3 py-1 text-xs ${selectedMap === map ? 'border-emerald-300 bg-emerald-900 text-white' : 'border-emerald-800 text-emerald-100'}`}
              >
                {map === 'all' ? 'All' : map}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search monsters…" className="min-w-40 flex-1" />
          <select aria-label="Sort monsters" value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-md border border-border bg-background px-2 text-sm">
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label={ascending ? 'Sort highest first' : 'Sort lowest first'}
            title={ascending ? 'Lowest first — switch to highest first' : 'Highest first — switch to lowest first'}
            onClick={() => setAscending((value) => !value)}
          >
            {ascending ? <ArrowDown className="size-4" /> : <ArrowUp className="size-4" />}
          </Button>
        </div>
        {(sort === 'tracktrix' || sort === 'next') && !achievements && <p className="text-xs text-amber-200">Tracktrix data unavailable; total scores use zero and score to next is unavailable.</p>}
        {!filtered.length && <p className="py-8 text-center text-sm">No monsters match this map and search.</p>}
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((monster) => {
            const milestones = achievementMilestones(monster)
            const progress = achievements?.[monster.id] || null
            const killed = Math.max(0, Number(progress?.score) || 0)
            const finalMilestone = milestones[milestones.length - 1] || 0
            const nextMilestone = milestones.find((value) => value > killed)
            const unlocked = milestones.filter((value) => value <= killed).length
            return (
              <button key={monster.id} type="button" onClick={() => setInspecting(monster)} className="min-w-0 rounded border border-rose-950 p-2 text-center">
                <SpriteIcon sprite={monster.sprite} size={48} className="mx-auto" />
                <p className="mt-1 truncate text-xs" title={monster.name}>
                  {monster.name}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {monster.hp.toLocaleString()} HP · {monster.xp.toLocaleString()} XP
                </p>
                <p className="font-mono text-[10px] text-rose-300/75">
                  {monster.attack.toLocaleString()} ATK · {monster.threat.toFixed(1)} threat
                </p>
                {!!finalMilestone && achievements && (
                  <>
                    <p className="mt-1 font-mono text-[10px] text-amber-200/80">
                      {killed.toLocaleString()} / {finalMilestone.toLocaleString()} score
                    </p>
                    {progress?.owner ? (
                      <p className="truncate font-mono text-[10px] text-amber-100/65" title={progress.owner}>
                        High score: {progress.owner}
                      </p>
                    ) : null}
                    <p className="font-mono text-[10px] text-emerald-300/80">
                      {unlocked} / {milestones.length} achievements unlocked
                    </p>
                    <p className="font-mono text-[10px] text-violet-300/80">{nextMilestone ? `${(nextMilestone - killed).toLocaleString()} score to next achievement` : 'All achievements complete'}</p>
                  </>
                )}
                {!!finalMilestone && !achievements && <p className="mt-1 font-mono text-[10px] text-amber-200/70">Tracktrix required for score totals</p>}
              </button>
            )
          })}
        </div>
      </div>
      {inspecting && (
        <Sheet open onOpenChange={(open) => !open && setInspecting(null)}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
            <MonsterDetail
              monster={inspecting}
              onInspectDrop={(itemId) => {
                if (state.merchantCatalog?.allItems?.some((entry) => entry.id === itemId)) {
                  setDropSource(`Dropped by ${inspecting.name}`)
                  setInspecting(null)
                  setDrop(itemId)
                }
              }}
              onNavigated={() => setInspecting(null)}
            />
          </SheetContent>
        </Sheet>
      )}
      {drop && (
        <Sheet open onOpenChange={(open) => !open && setDrop(null)}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
            <ItemDetailBrowser rootItemId={drop} rootLevel={0} catalog={state.merchantCatalog} monsters={state.bestiaryCatalog} context={{ character: dropSource, slot: -1 }} />
          </SheetContent>
        </Sheet>
      )}
    </AccountScreenScaffold>
  )
}
