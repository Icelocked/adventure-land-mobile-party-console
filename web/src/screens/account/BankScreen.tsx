import { useState } from 'react'
import { usePartyApi, useCharacters, useDynamicState, useRefreshDynamicStateNow, useRoster } from '@/data/PartyDataProvider'
import { useCatalogLookup, displayName } from '@/lib/catalogLookup'
import { SpriteIcon } from '@/components/SpriteIcon'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'
import type { CatalogItem, CharacterState, InventoryEntry } from '@/models'

/** Shared bank vault browse - ported from ui/account/BankScreen.kt,
 *  grouped by pack: withdraw to a character, or sell/deconstruct
 *  directly without withdrawing first. Tap a row to expand its action
 *  strip. */
export function BankScreen() {
  const dynamicState = useDynamicState()
  const roster = useRoster()
  const characters = useCharacters()
  const refreshNow = useRefreshDynamicStateNow()
  const catalogFor = useCatalogLookup(dynamicState.merchantCatalog)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const bank = dynamicState.bank

  return (
    <AccountScreenScaffold title={`Bank${bank ? ` · ${bank.gold.toLocaleString()}g` : ''}`} onRefresh={() => void refreshNow()}>
      <GoldBreakdown bankGold={bank?.gold ?? 0} characters={characters} />
      {!bank || Object.keys(bank.packs).length === 0 ? (
        <EmptyState message="No bank data yet." />
      ) : (
        <div className="flex flex-col gap-3 px-3">
          {Object.entries(bank.packs).map(([packName, entries]) => {
            const filled = entries.filter((e): e is InventoryEntry => e != null)
            if (filled.length === 0) return null
            return (
              <div key={packName}>
                <div className="mb-1 text-sm font-medium">{packName}</div>
                <div className="flex flex-col gap-1">
                  {filled.map((entry) => {
                    const key = `${packName}:${entry.slot}`
                    return (
                      <BankRow
                        key={key}
                        entry={entry}
                        pack={packName}
                        catalogFor={catalogFor}
                        expanded={expandedKey === key}
                        onToggle={() => setExpandedKey(expandedKey === key ? null : key)}
                        roster={roster}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </AccountScreenScaffold>
  )
}

function GoldBreakdown({ bankGold, characters }: { bankGold: number; characters: Record<string, CharacterState> }) {
  const total = bankGold + Object.values(characters).reduce((sum, c) => sum + (c.vitals?.gold ?? 0), 0)
  return (
    <div className="m-3 rounded-md border border-border bg-card p-4">
      <div className="flex justify-between text-sm">
        <span>Bank vault</span>
        <span>{bankGold.toLocaleString()}g</span>
      </div>
      {Object.entries(characters).map(([name, state]) => (
        <div key={name} className="flex justify-between text-xs text-muted-foreground">
          <span>{name}</span>
          <span>{(state.vitals?.gold ?? 0).toLocaleString()}g</span>
        </div>
      ))}
      <div className="mt-1.5 flex justify-between border-t border-border pt-1.5 text-sm font-medium">
        <span>Total</span>
        <span>{total.toLocaleString()}g</span>
      </div>
    </div>
  )
}

function BankRow({
  entry,
  pack,
  catalogFor,
  expanded,
  onToggle,
  roster,
}: {
  entry: InventoryEntry
  pack: string
  catalogFor: (id: string) => CatalogItem | undefined
  expanded: boolean
  onToggle: () => void
  roster: Record<string, unknown>
}) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const [pickingWithdraw, setPickingWithdraw] = useState(false)

  return (
    <div className="rounded-md border border-border bg-card p-2">
      <button className="flex w-full items-center gap-2" onClick={onToggle}>
        <SpriteIcon sprite={catalogFor(entry.item.name)?.sprite} size={36} />
        <span className="text-sm">
          {displayName(entry.item.name, catalogFor)}
          {entry.item.level != null ? ` +${entry.item.level}` : ''}
          {entry.item.q != null && entry.item.q > 1 ? ` x${entry.item.q}` : ''}
        </span>
      </button>
      {expanded &&
        (!pickingWithdraw ? (
          <div className="mt-1.5 flex gap-3 pl-1">
            <button className="text-xs text-primary underline" onClick={() => setPickingWithdraw(true)}>
              Withdraw to...
            </button>
            <button
              className="text-xs text-primary underline"
              onClick={async () => {
                await api.sellBankItemToNpc(entry.item, pack, entry.slot)
                await refreshNow()
              }}
            >
              Sell to NPC
            </button>
            <button
              className="text-xs text-primary underline"
              onClick={async () => {
                await api.markBankItemForDeconstruction(entry.item, pack, entry.slot)
                await refreshNow()
              }}
            >
              Deconstruct
            </button>
          </div>
        ) : (
          <div className="mt-1.5 flex flex-col gap-1 pl-1">
            {Object.keys(roster).map((name) => (
              <button
                key={name}
                className="text-left text-xs text-primary underline"
                onClick={async () => {
                  await api.withdrawFromBank(name, entry.item, pack, entry.slot)
                  setPickingWithdraw(false)
                  await refreshNow()
                }}
              >
                → {name}
              </button>
            ))}
          </div>
        ))}
    </div>
  )
}
