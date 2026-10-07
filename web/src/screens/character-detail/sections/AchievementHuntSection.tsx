import { useMemo, useState } from 'react'
import { usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { useMonsterAchievements } from '@/data/useMonsterAchievements'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { achievementMonsters, nextStep, type AchievementMonster } from '@/lib/achievementHunt'
import type { AchievementBlacklistEntry, PartyStateDynamic } from '@/models'
import { SectionCard } from '../SectionCard'

type Settings = { enabled: boolean; monsters: string[]; blacklistDeaths: boolean; deathThreshold: number }

function progress(monster: AchievementMonster, kills: number): string {
  const step = nextStep(monster.ladder, kills)
  return step < 0 ? `${Math.floor(kills).toLocaleString()} kills · complete` : `${Math.floor(kills).toLocaleString()} / ${monster.ladder[step].toLocaleString()} · step ${step + 1}`
}

/** Achievement Hunt (console branch achievement-hunt, docs/achievement-hunt.md): farms the selected
 *  monsters for their kill achievements, weakest first, one milestone step at a time. Shown for the
 *  party leader; absent when the console doesn't have the feature. */
export function AchievementHuntSection({ state }: { state: PartyStateDynamic }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const achievements = useMonsterAchievements()
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const monsters = useMemo(() => achievementMonsters(state.bestiaryCatalog || [], state.monsterChoices || []), [state.bestiaryCatalog, state.monsterChoices])
  const settings = state.achievementHunt as Settings | null | undefined
  if (!settings) return null
  const blacklist: Record<string, AchievementBlacklistEntry> = state.achievementBlacklist || {}
  const selected = new Set(settings.monsters)
  const regular = monsters.filter((m) => !m.special)
  const special = monsters.filter((m) => m.special)
  const hunting = state.farmingPolicy === 'hunt'
  const kills = (id: string) => Number(achievements[id]?.score) || 0

  const run = async (body: Parameters<typeof api.achievementHunt>[0]) => {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await api.achievementHunt(body)
    setBusy(false)
    if (result.kind === 'failure') return setError(result.message || 'Could not save Achievement Hunt')
    await refreshNow()
  }
  const choose = (ids: string[]) => run({ settings: { monsters: ids } })
  const toggle = (id: string) => choose(selected.has(id) ? settings.monsters.filter((x) => x !== id) : [...settings.monsters, id])
  // "Up to here": every regular monster from the weakest through this one; special picks are kept.
  const upTo = (index: number) => choose([...regular.slice(0, index + 1).map((m) => m.id), ...special.filter((m) => selected.has(m.id)).map((m) => m.id)])

  const row = (monster: AchievementMonster, index: number | null) => {
    const skipped = !!blacklist[monster.id]
    return (
      <div key={monster.id} className={`flex items-center gap-2 rounded border p-2 ${skipped ? 'border-rose-900 opacity-60' : 'border-border'}`}>
        <input type="checkbox" aria-label={`Farm ${monster.name} for achievements`} checked={selected.has(monster.id)} disabled={busy} onChange={() => void toggle(monster.id)} className="size-4" />
        <span className="min-w-0 flex-1 text-sm">
          {monster.name}
          <span className="block font-mono text-[10px] text-muted-foreground">
            {progress(monster, kills(monster.id))}
            {skipped ? ' · skipped' : ''}
          </span>
        </span>
        {index !== null && (
          <Button size="xs" variant="outline" disabled={busy} onClick={() => void upTo(index)}>
            Up to here
          </Button>
        )}
        <Button size="xs" variant="outline" disabled={busy} aria-label={skipped ? `Stop skipping ${monster.name}` : `Skip ${monster.name}`} onClick={() => void run({ blacklist: { action: skipped ? 'remove' : 'add', monsterId: monster.id } })}>
          {skipped ? 'Unskip' : 'Skip'}
        </Button>
      </div>
    )
  }

  return (
    <SectionCard title="Achievement Hunt">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-muted-foreground">
          {hunting && !settings.enabled ? 'Turn off Hunt mode to start.' : state.achievementMessage || 'Off'}
          <span className="block">{selected.size} selected · fights in your Auto/Default/Scatter mode</span>
        </p>
        <Button size="sm" variant={settings.enabled ? 'outline' : 'default'} disabled={busy || (!settings.enabled && (hunting || !selected.size))} onClick={() => void run({ settings: { enabled: !settings.enabled } })}>
          {settings.enabled ? 'Stop' : 'Start'}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <Button size="sm" variant="outline" onClick={() => setChoosing(true)}>
          Choose monsters…
        </Button>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={settings.blacklistDeaths} disabled={busy} onChange={(e) => void run({ settings: { blacklistDeaths: e.target.checked } })} />
          Skip after
          <input
            aria-label="Achievement Hunt death threshold"
            type="number"
            min={1}
            max={100}
            defaultValue={settings.deathThreshold}
            disabled={busy || !settings.blacklistDeaths}
            onBlur={(e) => {
              const value = Number(e.target.value)
              if (Number.isSafeInteger(value) && value >= 1 && value <= 100 && value !== settings.deathThreshold) void run({ settings: { deathThreshold: value } })
            }}
            className="w-12 rounded border border-border bg-background px-1"
          />
          deaths
        </label>
      </div>
      {Object.keys(blacklist).length > 0 && (
        <div aria-label="Achievement Hunt skipped monsters" className="mt-2 space-y-1 text-xs">
          {Object.values(blacklist).map((entry) => (
            <div key={entry.monsterId} className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                {monsters.find((m) => m.id === entry.monsterId)?.name || entry.monsterId} · <span className="text-muted-foreground">{entry.reason}</span>
              </span>
              <Button size="xs" variant="outline" disabled={busy} onClick={() => void run({ blacklist: { action: 'remove', monsterId: entry.monsterId } })}>
                Unskip
              </Button>
            </div>
          ))}
          <Button size="xs" variant="outline" disabled={busy} onClick={() => void run({ blacklist: { action: 'clear' } })}>
            Clear skipped
          </Button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      {choosing && (
        <Sheet open onOpenChange={(open) => !open && setChoosing(false)}>
          <SheetContent side="bottom" className="max-h-[85vh] gap-2 overflow-hidden p-4" aria-label="Achievement Hunt monsters">
            <h2 className="text-base font-semibold">Achievement Hunt monsters</h2>
            <p className="text-xs text-muted-foreground">Weakest first. Every selected monster reaches its next milestone before any moves to the one after.</p>
            <div className="flex gap-2">
              <Button size="xs" variant="outline" disabled={busy} onClick={() => void choose(regular.map((m) => m.id))}>
                All regular
              </Button>
              <Button size="xs" variant="outline" disabled={busy} onClick={() => void choose([])}>
                None
              </Button>
            </div>
            <div className="min-h-0 space-y-1.5 overflow-y-auto overscroll-contain">
              <section aria-label="Regular monsters" className="space-y-1.5">
                {regular.map((m, i) => row(m, i))}
              </section>
              <h3 className="pt-2 text-sm font-semibold">Special monsters</h3>
              <p className="text-xs text-muted-foreground">Bosses, event, cooperative and random-respawn monsters, and any without a regular spawn. Never picked by “Up to here”.</p>
              <section aria-label="Special monsters" className="space-y-1.5">
                {special.map((m) => row(m, null))}
              </section>
            </div>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          </SheetContent>
        </Sheet>
      )}
    </SectionCard>
  )
}
