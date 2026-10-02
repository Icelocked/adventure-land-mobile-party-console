import { useRef, useState } from 'react'
import { usePartyApi, useCharacters, useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { useCatalogLookup, displayName } from '@/lib/catalogLookup'
import { SpriteIcon } from '@/components/SpriteIcon'
import { ExpandChevron } from '@/components/ExpandChevron'
import { NpcSaleSheet } from '@/components/NpcSaleSheet'
import { bankSaleCopies } from '@/lib/bankSaleCopies'
import { Button } from '@/components/ui/button'
import { StandListingForm } from '@/components/StandListingForm'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'
import { canDeconstruct, sameMarkedItem } from '@/models'
import type { BankVault, CatalogItem, CharacterState, DeconstructionCatalog, DeconstructionMark, InventoryEntry, NpcSaleMark, StandListing, WithdrawalRequest } from '@/models'

/** Shared bank vault browse - ported from ui/account/BankScreen.kt and
 *  matched against the dashboard's own bank-sheet.tsx action set
 *  (confirmed field-by-field against party-console v1.1.0's source):
 *  mark/unmark for withdrawal (always to the configured merchant, same
 *  as the dashboard - an earlier version let you pick any character,
 *  which the dashboard has no UI for and can't show back to you), mark
 *  for stand with an all-stack variant, deconstruction gated by whether
 *  the item is actually deconstructible, and NPC sale with an all-stack
 *  variant. Tap a row to expand its action strip. */
export function BankScreen() {
  const dynamicState = useDynamicState()
  const characters = useCharacters()
  const refreshNow = useRefreshDynamicStateNow()
  const catalogFor = useCatalogLookup(dynamicState.merchantCatalog)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [collapsedPacks, setCollapsedPacks] = useState<Set<string>>(new Set())
  const bank = dynamicState.bank
  const merchant = Object.entries(characters).find(([, c]) => c.vitals?.ctype === 'merchant')?.[0] ?? null

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
                          <BankRow
                            key={key}
                            entry={entry}
                            pack={packName}
                            catalogFor={catalogFor}
                            expanded={expandedKey === key}
                            onToggle={() => setExpandedKey(expandedKey === key ? null : key)}
                            merchant={merchant}
                            withdrawals={merchant ? (dynamicState.withdrawals[merchant] ?? []) : []}
                            standListings={dynamicState.standListings}
                            deconstructionCatalog={dynamicState.deconstructionCatalog}
                            npcSaleMarks={dynamicState.npcSaleMarks}
                            deconstructionMarks={dynamicState.deconstructionMarks}
                          />
                        )
                      })}
                    </div>
                  ))}
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

/** What (if anything) to show on one bank row for a pending bank-side
 *  mark - a border color plus a small label, not a sprite overlay (bank
 *  rows are a plain list, not the icon grid InventorySection/
 *  EquipmentSection use, so an overlaid badge would just collide with
 *  the row's own sprite/text). Priority mirrors markBadge.ts: whichever
 *  mark is most "in flight" wins when a slot somehow has more than one.
 *  Withdrawal gets the dashboard's own amber border (bank-sheet.tsx's
 *  `marked()` check); the dashboard doesn't visually flag stand/NPC-
 *  sale/deconstruction bank marks at all, so those colors are new here. */
function bankRowMark(
  deconstructionMarked: boolean,
  npcSaleMarked: boolean,
  withdrawMarked: boolean,
  standListed: boolean,
): { label: string; border: string; text: string } | null {
  if (deconstructionMarked) return { label: 'Deconstruction', border: 'border-orange-400', text: 'text-orange-400' }
  if (npcSaleMarked) return { label: 'NPC sale', border: 'border-rose-400', text: 'text-rose-400' }
  if (withdrawMarked) return { label: 'Withdrawal', border: 'border-amber-400', text: 'text-amber-400' }
  if (standListed) return { label: 'Stand', border: 'border-violet-400', text: 'text-violet-400' }
  return null
}

function BankRow({
  entry,
  pack,
  catalogFor,
  expanded,
  onToggle,
  merchant,
  withdrawals,
  standListings,
  deconstructionCatalog,
  npcSaleMarks,
  deconstructionMarks,
}: {
  entry: InventoryEntry
  pack: string
  catalogFor: (id: string) => CatalogItem | undefined
  expanded: boolean
  onToggle: () => void
  merchant: string | null
  withdrawals: WithdrawalRequest[]
  standListings: StandListing[]
  deconstructionCatalog: DeconstructionCatalog
  npcSaleMarks: NpcSaleMark[]
  deconstructionMarks: DeconstructionMark[]
}) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const dynamicState = useDynamicState()
  const [standForm, setStandForm] = useState<'single' | 'all' | null>(null)
  const [confirmingNpcSale, setConfirmingNpcSale] = useState<'single' | 'all' | null>(null)
  // bank-withdrawal.tsx: withdraw is a server-side toggle, so a second tap
  // while the first is in flight would remove the mark it just added.
  const withdrawInFlight = useRef(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A request matching the SAME {pack, slot} toggles the pending
  // withdrawal off server-side (transfer-commands.ts's removingWithdrawal) -
  // this check is purely for the button's own label/visibility, not for
  // deciding which request to send; the server does that itself. Every
  // check here also verifies the mark's own item still matches what's in
  // this slot right now - a slot number alone can get reused once the
  // originally-marked item is gone (withdrawn, sold, restacked), and
  // without the identity check a stale mark would badge whatever item
  // happens to sit there now instead.
  const withdrawMarked = withdrawals.some((w) => w.pack === pack && w.slot === entry.slot && sameMarkedItem(w.item, entry.item))
  const standListing = standListings.find((l) => l.bankPack === pack && l.bankSlot === entry.slot && sameMarkedItem(l.item, entry.item))
  const deconstructible = canDeconstruct(entry.item, deconstructionCatalog)
  const saleTargets = bankSaleCopies(dynamicState.bank, dynamicState.bankbois, entry)
  const openStandForm = (mode: 'single' | 'all') => {
    // A new listing needs a free stand slot (party-inventory-panels.tsx).
    if (!standListing && standListings.length >= 16) return setError('Merchant stand is full (16/16)')
    setError(null)
    setStandForm(mode)
  }
  const npcSaleMarked = npcSaleMarks.some(
    (mark) => mark.source === 'bank' && mark.pack === pack && mark.slot === entry.slot && sameMarkedItem(mark.item, entry.item),
  )
  const deconstructionMarked = deconstructionMarks.some(
    (mark) => mark.state !== 'complete' && mark.storage?.pack === pack && mark.storage?.slot === entry.slot && sameMarkedItem(mark.item, entry.item),
  )
  const mark = bankRowMark(deconstructionMarked, npcSaleMarked, withdrawMarked, !!standListing)

  const run = async (action: () => Promise<{ kind: string; message?: string }>) => {
    const result = await action()
    if (result.kind === 'failure') setError(result.message ?? 'Request failed')
    else setError(null)
    await refreshNow()
  }

  const withdraw = async (markAll: boolean) => {
    if (withdrawInFlight.current || !merchant) return
    withdrawInFlight.current = true
    setWithdrawing(true)
    try {
      await run(() => api.withdrawFromBank(merchant, entry.item, pack, entry.slot, markAll))
    } finally {
      withdrawInFlight.current = false
      setWithdrawing(false)
    }
  }

  return (
    <div className={`rounded-md border bg-card p-2 ${mark ? mark.border : 'border-border'}`}>
      <button className="flex w-full items-center gap-2" onClick={onToggle}>
        <SpriteIcon sprite={catalogFor(entry.item.name)?.sprite} size={36} />
        <span className="min-w-0 flex-1 text-sm">
          {displayName(entry.item.name, catalogFor)}
          {entry.item.level != null ? ` +${entry.item.level}` : ''}
          {entry.item.q != null && entry.item.q > 1 ? ` x${entry.item.q}` : ''}
        </span>
        {mark && <span className={`shrink-0 text-[10px] font-medium uppercase ${mark.text}`}>{mark.label}</span>}
      </button>
      {expanded && (
        <>
          {standForm ? (
            // party-inventory-panels.tsx onBankStand: same stand dialog, with
            // "Mark all" preset for the all-copies action.
            <StandListingForm
              item={entry.item}
              itemValue={catalogFor(entry.item.name)?.meta?.definition.g as number | undefined}
              existing={standListing}
              markAll={standForm === 'all'}
              onCancel={() => setStandForm(null)}
              onSubmit={async ({ price, quantity, markAll }) => {
                await run(() => api.markForStand(entry.item, entry.slot, price, { id: standListing?.id, bankPack: pack, quantity, markAll }))
                setStandForm(null)
              }}
            />
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-2 pl-1">
              <Button
                variant="link"
                size="xs"
                disabled={!merchant || withdrawing}
                onClick={() => void withdraw(false)}
              >
                {withdrawMarked ? 'Unmark withdrawal' : 'Mark for withdrawal'}
              </Button>
              <Button
                variant="link"
                size="xs"
                disabled={!merchant || withdrawing}
                onClick={() => void withdraw(true)}
              >
                Mark all for withdrawal
              </Button>

              {standListing ? (
                <Button
                  variant="link"
                  size="xs"
                  onClick={() =>
                    void run(() => api.removeStandListing(standListing))
                  }
                >
                  Unmark for stand
                </Button>
              ) : (
                <>
                  <Button
                    variant="link"
                    size="xs"
                    onClick={() => openStandForm('single')}
                  >
                    Mark for stand
                  </Button>
                  <Button
                    variant="link"
                    size="xs"
                    onClick={() => openStandForm('all')}
                  >
                    Mark all for stand
                  </Button>
                </>
              )}

              {deconstructible && (
                <>
                  <Button
                    variant="link"
                    size="xs"
                    onClick={() => void run(() => api.markBankItemForDeconstruction(entry.item, pack, entry.slot))}
                  >
                    Mark for deconstruction
                  </Button>
                  <Button
                    variant="link"
                    size="xs"
                    onClick={() => void run(() => api.markBankItemForDeconstruction(entry.item, pack, entry.slot, true))}
                  >
                    Mark all for deconstruction
                  </Button>
                </>
              )}

              <Button variant="link" size="xs" className="text-destructive" onClick={() => setConfirmingNpcSale('single')}>
                Sell to NPC
              </Button>
              <Button
                variant="link"
                size="xs"
                className="text-destructive"
                onClick={() => {
                  if (!saleTargets.length) return setError('No unlocked matching bank items available')
                  setConfirmingNpcSale('all')
                }}
              >
                Sell all to NPC
              </Button>
            </div>
          )}
          {confirmingNpcSale && (
            <NpcSaleSheet
              item={entry.item}
              meta={catalogFor(entry.item.name)?.meta ?? undefined}
              location={confirmingNpcSale === 'all' ? `${saleTargets.length} slots across bank panes and bankbois` : `Bank · ${pack} · slot ${entry.slot}`}
              all={confirmingNpcSale === 'all'}
              available={confirmingNpcSale === 'all' ? saleTargets.reduce((sum, target) => sum + Number(target.entry.item.q || 1), 0) : Number(entry.item.q || 1)}
              onCancel={() => setConfirmingNpcSale(null)}
              onConfirm={async (quantity, acknowledged) => {
                // use-party-console.tsx confirmNpcSale: one sale per copy, each its whole stack.
                const sales =
                  confirmingNpcSale === 'all'
                    ? saleTargets.map((target) => () => api.sellBankItemToNpc(target.entry.item, target.pack, target.entry.slot, { quantity: Number(target.entry.item.q || 1), acknowledged }))
                    : [() => api.sellBankItemToNpc(entry.item, pack, entry.slot, { quantity, acknowledged })]
                for (const sale of sales) {
                  const result = await sale()
                  if (result.kind === 'failure') return result.message
                }
                setConfirmingNpcSale(null)
                await refreshNow()
                return null
              }}
            />
          )}
          {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
        </>
      )}
    </div>
  )
}
