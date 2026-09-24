import { useState } from 'react'
import { useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { SpriteIcon } from '@/components/SpriteIcon'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'
import type { BestiaryDrop, BestiaryMonster } from '@/models'

/** Monster reference list - ported from ui/account/BestiaryScreen.kt.
 *  Tap a monster to expand its drop table (item, drop rate, quantity). */
export function BestiaryScreen() {
  const dynamicState = useDynamicState()
  const refreshNow = useRefreshDynamicStateNow()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <AccountScreenScaffold title="Bestiary" onRefresh={() => void refreshNow()}>
      {dynamicState.bestiaryCatalog.length === 0 ? (
        <EmptyState message="No bestiary data yet." />
      ) : (
        <div className="flex flex-col gap-1.5 p-3">
          {dynamicState.bestiaryCatalog.map((monster) => (
            <MonsterRow key={monster.id} monster={monster} expanded={expandedId === monster.id} onToggle={() => setExpandedId(expandedId === monster.id ? null : monster.id)} />
          ))}
        </div>
      )}
    </AccountScreenScaffold>
  )
}

function MonsterRow({ monster, expanded, onToggle }: { monster: BestiaryMonster; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <button className="flex w-full items-center justify-between gap-2" onClick={onToggle}>
        <span className="flex min-w-0 items-center gap-2">
          <SpriteIcon sprite={monster.sprite} size={28} />
          <span className="truncate text-sm font-medium">{monster.name}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          HP {monster.hp.toLocaleString()} · ATK {monster.attack.toLocaleString()} · XP {monster.xp.toLocaleString()}
        </span>
      </button>
      {expanded &&
        (monster.drops.length === 0 ? (
          <p className="mt-1.5 text-xs text-muted-foreground">No known drops.</p>
        ) : (
          <div className="mt-2 flex flex-col gap-1">
            <div className="text-xs font-medium text-muted-foreground">Drops</div>
            {[...monster.drops].sort((a, b) => b.rate - a.rate).map((drop) => (
              <DropRow key={drop.id} drop={drop} />
            ))}
          </div>
        ))}
    </div>
  )
}

function DropRow({ drop }: { drop: BestiaryDrop }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <SpriteIcon sprite={drop.sprite} size={28} />
        <span className="text-sm">
          {drop.name}
          {drop.quantity > 1 ? ` x${drop.quantity}` : ''}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">{(drop.rate * 100).toFixed(4)}%</span>
    </div>
  )
}
