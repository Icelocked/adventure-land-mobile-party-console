import { useState } from 'react'
import { usePartyApi, useCharacters, useDynamicState, useRefreshDynamicStateNow, useDomainInterest } from '@/data/PartyDataProvider'
import { useCatalogLookup, displayName } from '@/lib/catalogLookup'
import { SpriteIcon } from '@/components/SpriteIcon'
import { ExpandChevron } from '@/components/ExpandChevron'
import { Input } from '@/components/ui/input'
import { BankItemPanel } from '@/screens/itempanel/BankItemPanel'
import { Button } from '@/components/ui/button'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'
import { sameMarkedItem } from '@/models'
import type { BankVault, CatalogItem, CharacterState, InventoryEntry } from '@/models'

/** Shared bank vault browse - ported from ui/account/BankScreen.kt and
 *  matched against the dashboard's own bank-sheet.tsx action set
 *  (confirmed field-by-field against party-console v1.1.0's source):
 *  mark/unmark for withdrawal (always to the configured merchant, same
 *  as the dashboard - an earlier version let you pick any character,
 *  which the dashboard has no UI for and can't show back to you), mark
 *  for stand, deconstruction gated by whether the item is actually
 *  deconstructible, and NPC sale. Tap a row to open its options. */
export function BankScreen() {
  useDomainInterest('bank')
  const dynamicState = useDynamicState()
  const characters = useCharacters()
  const refreshNow = useRefreshDynamicStateNow()
  const catalogFor = useCatalogLookup(dynamicState.merchantCatalog)
  const [opened, setOpened] = useState<{ pack: string; entry: InventoryEntry } | null>(null)
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  // bank-sheet.tsx matchesSearch: item id or name; non-matches are dimmed.
  const matches = (entry: InventoryEntry) =>
    !query || [entry.item.name, catalogFor(entry.item.name)?.name].some((name) => String(name || '').toLowerCase().includes(query))
  const [collapsedPacks, setCollapsedPacks] = useState<Set<string>>(new Set())
  const bank = dynamicState.bank

  const togglePack = (packName: string) =>
    setCollapsedPacks((old) => {
      const next = new Set(old)
      if (next.has(packName)) next.delete(packName)
      else next.add(packName)
      return next
    })

  return (
    <AccountScreenScaffold title={`Bank${bank ? ` · ${bank.gold.toLocaleString()}g` : ''}`} onRefresh={() => void refreshNow()}>
      <GoldBreakdown bankGold={bank?.gold ?? 0} characters={characters} />
      {dynamicState.bankSortMode === 'request' && <BankSortToggle pending={dynamicState.bankSortRequest} />}
      <LockedVaultsSection bankVaults={dynamicState.bankVaults} unlockedPacks={bank?.packs} />
      <div className="px-3 pb-3">
        <Input type="search" aria-label="Search bank items" placeholder="Search by item name or ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {!bank || Object.keys(bank.packs).length === 0 ? (
        <EmptyState message="No bank data yet." />
      ) : (
        <div className="flex flex-col gap-3 px-3">
          {Object.entries(bank.packs).map(([packName, entries]) => {
            const filled = entries.filter((e): e is InventoryEntry => e != null)
            // items1's last 7 slots are reserved and never usable, even
            // though the pack still reports a full 42-length array -
            // matches bank-sheet.tsx's own `usableItems` split, so "free"
            // here doesn't overstate real deposit room on that one pack.
            const usableEntries = packName === 'items1' ? entries.slice(0, 35) : entries
            const free = usableEntries.length - usableEntries.filter((e) => e != null).length
            const freeColor = free < 5 ? 'text-destructive' : free <= 10 ? 'text-amber-500' : 'text-muted-foreground'
            const expanded = !collapsedPacks.has(packName)
            return (
              <div key={packName}>
                <button className="flex w-full items-center gap-1.5 text-left" onClick={() => togglePack(packName)}>
                  <span className="min-w-0 flex-1 text-sm font-medium">{packName}</span>
                  <span className={`font-mono text-xs ${freeColor}`} title={`${free} slots free`}>
                    {filled.length}/{entries.length} · {free} free
                  </span>
                  <ExpandChevron expanded={expanded} />
                </button>
                {expanded &&
                  (filled.length === 0 ? (
                    <p className="mt-1 pl-1 text-xs text-muted-foreground">Empty.</p>
                  ) : (
                    <div className="mt-1 flex flex-col gap-1">
                      {filled.map((entry) => {
                        const key = `${packName}:${entry.slot}`
                        return (
                          <BankRow key={key} entry={entry} pack={packName} catalogFor={catalogFor} dimmed={!matches(entry)} onOpen={() => setOpened({ pack: packName, entry })} />
                        )
                      })}
                    </div>
                  ))}
              </div>
            )
          })}
        </div>
      )}
      {opened && <BankItemPanel pack={opened.pack} entry={opened.entry} onClose={() => setOpened(null)} />}
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

/** bank-sort-control.tsx's one-shot "Sort on next visit" toggle, distinct from the standing
 *  automatic/on-request mode radio already ported into Collection settings - only shown while
 *  that mode is "request". */
function BankSortToggle({ pending }: { pending?: { status: 'queued' | 'sorting' | 'retry'; message?: string } | null }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const statusLabel = pending?.status === 'sorting' ? 'Sorting' : pending?.status === 'retry' ? `Retry pending${pending.message ? `: ${pending.message}` : ''}` : pending ? 'Queued' : ''
  return (
    <div className="mx-3 mb-3 flex items-center gap-3 rounded-md border border-border bg-card p-3">
      <Button
        size="sm"
        variant={pending ? 'default' : 'outline'}
        onClick={async () => {
          await api.requestBankSort(!pending)
          await refreshNow()
        }}
      >
        Sort on next visit · {pending ? 'On' : 'Off'}
      </Button>
      {statusLabel && <span className="text-xs text-muted-foreground">{statusLabel}</span>}
    </div>
  )
}

/** bank-unlock.ts's locked-vault list, grouped by floor - the base "bank" floor's
 *  vaults each just cost gold once accessible; a non-base floor (bank_b/bank_u)
 *  needs its own first (0-gold) vault unlocked with an owned key before any
 *  other vault on that floor opens. The server enforces that ordering; this UI
 *  just offers whichever action a locked vault's own fields call for and
 *  surfaces the server's error if it's out of order. */
function LockedVaultsSection({ bankVaults, unlockedPacks }: { bankVaults: BankVault[]; unlockedPacks?: Record<string, unknown> }) {
  const [expandedFloor, setExpandedFloor] = useState<string | null>(null)
  const locked = bankVaults.filter((vault) => !unlockedPacks?.[vault.pack])
  if (locked.length === 0) return null

  const byFloor = new Map<string, BankVault[]>()
  for (const vault of locked) {
    const list = byFloor.get(vault.floor) ?? []
    list.push(vault)
    byFloor.set(vault.floor, list)
  }

  return (
    <div className="mx-3 mb-3 flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <span className="text-sm font-medium">Locked bank vaults ({locked.length})</span>
      {[...byFloor.entries()].map(([floor, vaults]) => (
        <div key={floor}>
          <button
            className="flex w-full items-center gap-1.5 text-left text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setExpandedFloor(expandedFloor === floor ? null : floor)}
          >
            <span className="min-w-0 flex-1">{floor} ({vaults.length})</span>
            <ExpandChevron expanded={expandedFloor === floor} />
          </button>
          {expandedFloor === floor && (
            <div className="mt-1 flex flex-col gap-1 pl-1">
              {vaults.map((vault) => (
                <LockedVaultRow key={vault.pack} vault={vault} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function LockedVaultRow({ vault }: { vault: BankVault }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsKey = vault.gold === 0 && vault.key
  const label = needsKey ? `Unlock with ${vault.key?.name ?? 'key'}` : `Unlock · ${vault.gold.toLocaleString()}g`

  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{vault.pack}</span>
      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-destructive">Really {label.toLowerCase()}?</span>
          <Button
            variant="link"
            size="xs"
            onClick={async () => {
              setConfirming(false)
              setError(null)
              const result = await api.unlockBankVault(vault.pack, needsKey ? 'key' : undefined)
              if (result.kind === 'failure') setError(result.message)
              await refreshNow()
            }}
          >
            Confirm
          </Button>
          <Button variant="link" size="xs" className="text-muted-foreground" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="link" size="xs" onClick={() => setConfirming(true)}>
          {label}
        </Button>
      )}
      {error && <span className="text-destructive">{error}</span>}
    </div>
  )
}

/** bank-sheet.tsx tile markers, as a list row: every pending mark shows at
 *  once (withdrawal border + Withdraw / Stand / NPC / Deconstruct labels),
 *  plus the stat-scroll badge and RESERVED on items1's last seven slots.
 *  Tapping opens the item's options (BankItemPanel). */
function BankRow({ entry, pack, catalogFor, dimmed, onOpen }: { entry: InventoryEntry; pack: string; catalogFor: (id: string) => CatalogItem | undefined; dimmed: boolean; onOpen: () => void }) {
  const state = useDynamicState()
  const merchant = state.merchantCharacter ?? null
  const { item } = entry
  const withdrawMarked = !!merchant && (state.withdrawals[merchant] ?? []).some((w) => w.pack === pack && w.slot === entry.slot && sameMarkedItem(w.item, item))
  const standMarked = state.standListings.some((l) => l.bankPack === pack && l.bankSlot === entry.slot && sameMarkedItem(l.item, item))
  const npcMarked = state.npcSaleMarks.some((mark) => mark.pack === pack && mark.slot === entry.slot && sameMarkedItem(mark.item, item))
  const deconstructionMarked = state.deconstructionMarks.some(
    (mark) => mark.state !== 'complete' && mark.storage?.pack === pack && mark.storage?.slot === entry.slot && sameMarkedItem(mark.item, item),
  )
  const reserved = pack === 'items1' && entry.slot >= 35
  const marks = [withdrawMarked && 'Withdraw', standMarked && 'Stand', npcMarked && 'NPC', deconstructionMarked && 'Deconstruct'].filter(Boolean) as string[]
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-2 rounded-md border bg-card p-2 text-left transition-opacity ${withdrawMarked ? 'border-amber-400' : reserved ? 'border-fuchsia-800' : 'border-border'} ${dimmed ? 'opacity-25' : ''}`}
    >
      <SpriteIcon sprite={catalogFor(item.name)?.sprite} size={36} />
      <span className="min-w-0 flex-1 text-sm">
        {displayName(item.name, catalogFor)}
        {item.level ? ` +${item.level}` : ''}
        {item.q != null && item.q > 1 ? ` x${item.q}` : ''}
        {item.stat_type && <span className="ml-1 rounded bg-primary/15 px-1 font-mono text-[10px] uppercase text-primary">{item.stat_type}</span>}
      </span>
      {reserved && <span className="shrink-0 font-mono text-[9px] font-bold tracking-widest text-fuchsia-400">RESERVED</span>}
      {marks.map((label) => (
        <span key={label} className="shrink-0 text-[10px] font-medium uppercase text-amber-500">
          {label}
        </span>
      ))}
    </button>
  )
}
