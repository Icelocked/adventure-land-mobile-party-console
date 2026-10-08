import { useEffect, useMemo, useState } from 'react'
import { useDynamicState, usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { useMonsterAchievements } from '@/data/useMonsterAchievements'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { achievementMonsters, nextStep, type AchievementMonster } from '@/lib/achievementHunt'
import type { AchievementBlacklistEntry, AchievementHuntSettings } from '@/models'

// Server defaults (runtime/coordinator/hunt/achievement-settings.ts).
const DEFAULT_SETTINGS: AchievementHuntSettings = { monsters: [], blacklistDeaths: true, deathThreshold: 3, fillIdle: true }

function progress(monster: AchievementMonster, kills: number): string {
  const step = nextStep(monster.ladder, kills)
  return step < 0 ? `${Math.floor(kills).toLocaleString()} kills · complete` : `${Math.floor(kills).toLocaleString()} / ${monster.ladder[step].toLocaleString()} · step ${step + 1}`
}

/** Achievement Hunt settings for one farming scope (console branch achievement-hunt,
 *  docs/achievement-hunt.md), on the Farming settings screen below Hunt. Every
 *  request carries `character`; a follower sees the leader's settings read-only. */
export function AchievementHuntSettingsBlock({
  character,
  value,
  blacklist,
  editable,
  onInspect,
}: {
  character: string
  value: AchievementHuntSettings
  blacklist: Record<string, AchievementBlacklistEntry>
  editable: boolean
  onInspect: (id: string) => void
}) {
  const dynamicState = useDynamicState()
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const achievements = useMonsterAchievements()
  const settings = { ...DEFAULT_SETTINGS, ...value }
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deaths, setDeaths] = useState(String(settings.deathThreshold))
  useEffect(() => setDeaths(String(settings.deathThreshold)), [settings.deathThreshold])
  const monsters = useMemo(
    () => achievementMonsters(dynamicState.bestiaryCatalog || [], dynamicState.monsterChoices || []),
    [dynamicState.bestiaryCatalog, dynamicState.monsterChoices],
  )
  const sprite = useMemo(() => {
    const byId = new Map(dynamicState.bestiaryCatalog.map((m) => [m.id, m.sprite]))
    return (id: string) => byId.get(id)
  }, [dynamicState.bestiaryCatalog])
  const regular = monsters.filter((m) => !m.special)
  const special = monsters.filter((m) => m.special)
  const selected = new Set(settings.monsters)
  const kills = (id: string) => Number(achievements[id]?.score) || 0
  const entries = Object.values(blacklist).sort((a, b) => a.monsterId.localeCompare(b.monsterId))

  const run = async (body: Parameters<typeof api.achievementHunt>[1]) => {
    if (!editable || busy) return
    setBusy(true)
    setError(null)
    const result = await api.achievementHunt(character, body)
    setBusy(false)
    if (result.kind === 'failure') return setError(result.message || 'Could not save Achievement Hunt settings')
    await refreshNow()
  }
  const choose = (ids: string[]) => run({ settings: { monsters: ids } })
  const toggle = (id: string) => choose(selected.has(id) ? settings.monsters.filter((x) => x !== id) : [...settings.monsters, id])
  // Every regular monster from the weakest through this one; special picks are kept.
  const upTo = (index: number) => choose([...regular.slice(0, index + 1).map((m) => m.id), ...special.filter((m) => selected.has(m.id)).map((m) => m.id)])
  const threshold = () => {
    const n = Number(deaths)
    if (!deaths.trim() || !Number.isSafeInteger(n) || n < 1 || n > 100) return setError('The death threshold must be a whole number from 1 to 100.')
    if (n !== settings.deathThreshold) void run({ settings: { deathThreshold: n } })
  }

  const row = (monster: AchievementMonster, index: number | null) => (
    <div key={monster.id} className="flex items-center gap-2.5 rounded-md border border-border bg-card p-2">
      <input
        type="checkbox"
        aria-label={`Farm ${monster.name} for achievements`}
        checked={selected.has(monster.id)}
        disabled={!editable || busy}
        onChange={() => void toggle(monster.id)}
        className="size-4"
      />
      <button type="button" aria-label={`Inspect ${monster.name}`} onClick={() => onInspect(monster.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <SpriteIcon sprite={sprite(monster.id)} size={28} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{monster.name}</p>
          <p className="text-xs text-muted-foreground">
            {progress(monster, kills(monster.id))}
            {blacklist[monster.id] ? ' · blacklisted' : ''}
          </p>
        </div>
      </button>
      {index !== null && (
        <Button size="xs" variant="outline" disabled={!editable || busy} onClick={() => void upTo(index)}>
          Up to here
        </Button>
      )}
    </div>
  )

  return (
    <section aria-label="Achievement Hunt settings" className="flex flex-col gap-3 px-3 pb-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Achievement Hunt</h2>
        <Button size="sm" variant="outline" onClick={() => setChoosing(true)}>
          Monsters ({selected.size})
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Farms the selected monsters for their kill achievements, weakest first. Every selected monster reaches its next milestone before any moves on to the one after.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.blacklistDeaths}
          disabled={!editable || busy}
          onChange={(e) => void run({ settings: { blacklistDeaths: e.target.checked } })}
          className="size-4"
        />
        Blacklist monsters after
        <Input
          aria-label="Achievement Hunt deaths before blacklisting"
          inputMode="numeric"
          value={deaths}
          disabled={!editable || busy || !settings.blacklistDeaths}
          onChange={(e) => setDeaths(e.target.value)}
          onBlur={threshold}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-16"
        />
        deaths
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.fillIdle !== false}
          disabled={!editable || busy}
          onChange={(e) => void run({ settings: { fillIdle: e.target.checked } })}
          className="size-4"
        />
        Fill respawn waits with nearby monsters
      </label>
      <p className="-mt-2 text-xs text-muted-foreground">
        While the target respawns, the party fights weaker monsters that spawn within its search radius. The target always comes first.
      </p>
      {entries.length > 0 && (
        <div aria-label="Achievement Hunt blacklist" className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm">Blacklisted</p>
            <Button size="sm" variant="destructive" disabled={!editable || busy} onClick={() => void run({ blacklist: { action: 'clear' } })}>
              Clear all
            </Button>
          </div>
          {entries.map((entry) => (
            <div key={entry.monsterId} className="flex items-center gap-2.5 rounded-md border border-border bg-card p-2.5">
              <button
                type="button"
                aria-label={`Inspect ${monsters.find((m) => m.id === entry.monsterId)?.name || entry.monsterId}`}
                onClick={() => onInspect(entry.monsterId)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <SpriteIcon sprite={sprite(entry.monsterId)} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{monsters.find((m) => m.id === entry.monsterId)?.name ?? entry.monsterId}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.reason} · {new Date(entry.at).toLocaleString()}
                  </p>
                </div>
              </button>
              <Button size="sm" variant="outline" disabled={!editable || busy} onClick={() => void run({ blacklist: { action: 'remove', monsterId: entry.monsterId } })}>
                Clear
              </Button>
            </div>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {choosing && (
        <Sheet open onOpenChange={(open) => !open && setChoosing(false)}>
          <SheetContent side="bottom" className="max-h-[85vh] gap-2 overflow-hidden p-4" aria-label="Achievement Hunt monsters">
            <h2 className="text-base font-semibold">Achievement Hunt monsters</h2>
            <p className="text-xs text-muted-foreground">Weakest first, by experience per kill. Up to here selects every monster above it. Tap a monster for details.</p>
            <div className="flex gap-2">
              <Button size="xs" variant="outline" disabled={!editable || busy} onClick={() => void choose(regular.map((m) => m.id))}>
                All regular
              </Button>
              <Button size="xs" variant="outline" disabled={!editable || busy} onClick={() => void choose([])}>
                None
              </Button>
            </div>
            <div className="min-h-0 space-y-1.5 overflow-y-auto overscroll-contain">
              <section aria-label="Regular monsters" className="space-y-1.5">
                {regular.map((m, i) => row(m, i))}
              </section>
              <h3 className="pt-2 text-sm font-semibold">Special monsters</h3>
              <p className="text-xs text-muted-foreground">
                Bosses, event, cooperative and random-respawn monsters, training dummies, Cave of Many Dreams monsters, and any without a regular spawn. Up to here never selects them.
              </p>
              <section aria-label="Special monsters" className="space-y-1.5">
                {special.map((m) => row(m, null))}
              </section>
            </div>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          </SheetContent>
        </Sheet>
      )}
    </section>
  )
}
