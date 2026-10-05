import { useState } from 'react'
import { createPortal } from 'react-dom'
import { MapPin } from 'lucide-react'
import { useCharacters, useDynamicState, usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { useMonsterAchievements } from '@/data/useMonsterAchievements'
import { formatDropRate } from '@/lib/itemFormulas'
import { DefinitionGrid } from '@/components/DefinitionGrid'
import { displayValue } from '@/lib/statusDuration'
import { FarmingAreaPicker, MonsterSpawns, type SpawnRecord } from '@/components/FarmingAreaPicker'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Button } from '@/components/ui/button'
import type { BestiaryDrop, BestiaryMonster, CatalogItem, ItemDropSource, Sprite } from '@/models'

type Achievement = { score: number; owner: string | null }

/** Header with G.monsters id and Navigate,
 *  achievements, recorded spawns, the definition grid and drops. */
export function MonsterDetail({ monster, onInspectDrop, onNavigated }: { monster: BestiaryMonster; onInspectDrop: (itemId: string) => void; onNavigated?: () => void }) {
  const state = useDynamicState()
  const achievements = useMonsterAchievements()
  const [navigating, setNavigating] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <SpriteIcon sprite={monster.sprite} size={56} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">{monster.name}</p>
          <p className="font-mono text-xs text-muted-foreground">G.monsters.{monster.id}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={monster.id === 'tinyp'}
          onClick={() => setNavigating(true)}
          title={monster.id === 'tinyp' ? 'Fairy has no regular route; enable passive Fairy hunting' : `Navigate to ${monster.name}`}
          aria-label={`Navigate to ${monster.name}`}
          className="shrink-0 border-cyan-600 text-cyan-200"
        >
          <MapPin className="size-4" />
        </Button>
      </div>
      <MonsterAchievementProgress monster={monster} achievement={Object.keys(achievements).length ? achievements[monster.id] || null : null} />
      <MonsterSpawns records={monster.spawnRecords as unknown as SpawnRecord[] | undefined} />
      <DefinitionGrid value={monster.definition || {}} omit={['name', 'skin', 'achievements']} />
      <section className="rounded border border-amber-900/80 p-3">
        <BestiaryDrops monster={monster} catalog={state.merchantCatalog?.allItems || []} onInspectDrop={onInspectDrop} />
      </section>
      {navigating && (
        <MonsterNavigatePicker
          monster={monster}
          onClose={() => setNavigating(false)}
          onNavigated={() => {
            setNavigating(false)
            onNavigated?.()
          }}
        />
      )}
    </div>
  )
}

/** FarmingAreaPicker for a monster navigation:
 *  the leader's position and waypoint, override on, then
 *  POST /navigate-to-monster (startFarmingArea). */
function MonsterNavigatePicker({ monster, onClose, onNavigated }: { monster: BestiaryMonster; onClose: () => void; onNavigated: () => void }) {
  const state = useDynamicState()
  const characters = useCharacters()
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const [busy, setBusy] = useState(false)
  const leader = state.leader || ''
  const vitals = characters[leader]?.vitals
  return createPortal(
    <div role="group" aria-label={`Navigate to ${monster.name}`} className="pointer-events-auto fixed inset-0 z-[60] overflow-y-auto bg-background p-3">
      <FarmingAreaPicker
        catalog={state.monsterChoices}
        bestiaryCatalog={state.bestiaryCatalog}
        ids={[monster.id]}
        character={vitals ? { map: vitals.map, x: vitals.x, y: vitals.y } : null}
        waypoint={state.characterLocations?.[leader] || state.partyLocation}
        radius={state.monsterSearchRadiusByCharacter?.[leader] || 400}
        override
        busy={busy}
        savedPhoenixOrder={state.phoenixRouteOrder}
        onCancel={onClose}
        onStart={async (area, phoenixRouteOrder) => {
          setBusy(true)
          try {
            const location = { ...area }
            const result = phoenixRouteOrder ? await api.navigateToMonster('phoenix', location, phoenixRouteOrder) : await api.navigateToMonster(monster.id, location)
            if (result.kind === 'failure') throw new Error(result.message)
            await refreshNow()
            onNavigated()
          } finally {
            setBusy(false)
          }
        }}
      />
    </div>,
    document.body,
  )
}

function MonsterAchievementProgress({ monster, achievement }: { monster: BestiaryMonster; achievement: Achievement | null }) {
  const achievementsList = Array.isArray(monster.definition?.achievements) ? ((monster.definition!.achievements as unknown[]).filter(Array.isArray) as unknown[][]) : []
  if (!achievementsList.length) return null
  const reward = (entry: unknown[]) => {
    const kind = displayValue(entry[1] || 'reward')
    const stat = displayValue(entry[2] || '')
      .replaceAll('_', ' ')
      .toUpperCase()
    const amount = Number(entry[3])
    if (kind === 'stat' && stat) return `${amount >= 0 ? '+' : ''}${amount.toLocaleString()} ${stat}`
    return entry.slice(1).map(displayValue).join(' · ')
  }
  const kills = achievement ? Math.max(0, Number(achievement.score) || 0) : null
  const unlocked = kills === null ? 0 : achievementsList.filter((entry) => kills >= Number(entry[0] || 0)).length
  return (
    <section aria-label="Monster achievements" className="rounded border border-violet-900/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="font-mono text-xs uppercase text-violet-300">Monster achievements</h4>
        <span className="font-mono text-[10px] text-emerald-200/75">
          {kills === null ? 'Tracktrix data unavailable' : `${unlocked}/${achievementsList.length} unlocked · ${kills.toLocaleString()} score${achievement?.owner ? ` · ${achievement.owner}` : ''}`}
        </span>
      </div>
      <div className="space-y-1.5">
        {achievementsList.map((entry, index) => {
          const required = Math.max(0, Number(entry[0]) || 0)
          const complete = kills !== null && kills >= required
          return (
            <div key={`${required}:${index}`} className={`flex items-center justify-between gap-3 rounded border px-2.5 py-2 text-xs ${complete ? 'border-emerald-700/70' : 'border-slate-800'}`}>
              <span className={complete ? 'text-emerald-300' : 'text-slate-400'}>
                {complete ? '✓ Unlocked' : '○ Locked'} · {reward(entry)}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-amber-200/80">{required.toLocaleString()} score</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

type DropCard = BestiaryDrop & { originRate?: number; sourceType?: string; acquisitionPath?: string[]; mapName?: string }

/** Zone and world loot rolls for this monster. */
function indirectBestiaryDrops(monster: BestiaryMonster, catalog: CatalogItem[]) {
  const drops: DropCard[] = []
  const seen = new Set<string>()
  for (const item of catalog) {
    for (const source of (item.meta?.world?.drops || []) as (ItemDropSource & { mapId?: string; mapName?: string })[]) {
      if (source.monsterId !== monster.id || (source.sourceType !== 'zone' && source.sourceType !== 'world')) continue
      const key = `${item.id}:${source.sourceType}:${source.mapId || ''}`
      if (seen.has(key)) continue
      seen.add(key)
      drops.push({ id: item.id, name: item.name, rate: source.rate, quantity: source.quantity || 1, sprite: item.sprite as Sprite | null | undefined, sourceType: source.sourceType, mapName: source.mapName })
    }
  }
  return drops.sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name))
}

/** Monster-specific drops in server order, then zone and world drops. */
function BestiaryDrops({ monster, catalog, onInspectDrop }: { monster: BestiaryMonster; catalog: CatalogItem[]; onInspectDrop: (itemId: string) => void }) {
  const otherDrops = indirectBestiaryDrops(monster, catalog)
  const cards = (drops: DropCard[], indirect = false) =>
    drops.length ? (
      <div className="grid gap-2">
        {drops.map((drop, index) => (
          <button
            type="button"
            key={`${drop.id}-${drop.sourceType || 'monster'}-${drop.mapName || ''}-${index}`}
            onClick={() => onInspectDrop(drop.id)}
            className="flex items-center gap-2 rounded border border-amber-950 p-2 text-left"
          >
            <SpriteIcon sprite={drop.sprite} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs">{drop.name}</span>
              <span className="font-mono text-[10px] text-amber-300">{formatDropRate(drop as unknown as ItemDropSource)}</span>
              {indirect ? <span className="block truncate font-mono text-[10px] text-cyan-300/70">{drop.sourceType === 'world' ? 'World drop' : `${drop.mapName || 'Map'} zone drop`}</span> : null}
            </span>
          </button>
        ))}
      </div>
    ) : (
      <p className="text-xs text-muted-foreground">None listed in the current game data.</p>
    )
  return (
    <>
      <h4 className="mb-2 font-mono text-xs uppercase text-amber-300">Monster-specific drops ({monster.drops.length})</h4>
      {cards(monster.drops)}
      <h4 className="mb-2 mt-4 font-mono text-xs uppercase text-cyan-300">Zone &amp; world drops ({otherDrops.length})</h4>
      <p className="mb-2 text-xs text-muted-foreground">Shared loot-table rolls available while defeating this monster in the listed area.</p>
      {cards(otherDrops, true)}
    </>
  )
}
