import { useState } from 'react'
import { usePartyApi, useCharacters, useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { useCatalogLookup, displayName } from '@/lib/catalogLookup'
import { SpriteIcon } from '@/components/SpriteIcon'
import { ExpandChevron } from '@/components/ExpandChevron'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'
import { canDeconstruct } from '@/models'
import type { BankVault, CatalogItem, CharacterState, DeconstructionCatalog, InventoryEntry, StandListing, WithdrawalRequest } from '@/models'

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
  const bank = dynamicState.bank
  const merchant = Object.entries(characters).find(([, c]) => c.vitals?.ctype === 'merchant')?.[0] ?? null

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
                        merchant={merchant}
                        withdrawals={merchant ? (dynamicState.withdrawals[merchant] ?? []) : []}
                        standListings={dynamicState.standListings}
                        deconstructionCatalog={dynamicState.deconstructionCatalog}
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
          <button
            className="text-primary underline"
            onClick={async () => {
              setConfirming(false)
              setError(null)
              const result = await api.unlockBankVault(vault.pack, needsKey ? 'key' : undefined)
              if (result.kind === 'failure') setError(result.message)
              await refreshNow()
            }}
          >
            Confirm
          </button>
          <button className="text-muted-foreground underline" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="text-primary underline" onClick={() => setConfirming(true)}>
          {label}
        </button>
      )}
      {error && <span className="text-destructive">{error}</span>}
    </div>
  )
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
}) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const [standForm, setStandForm] = useState<'single' | 'all' | null>(null)
  const [standPrice, setStandPrice] = useState('')
  const [error, setError] = useState<string | null>(null)

  // A request matching the SAME {pack, slot} toggles the pending
  // withdrawal off server-side (transfer-commands.ts's removingWithdrawal) -
  // this check is purely for the button's own label/visibility, not for
  // deciding which request to send; the server does that itself.
  const withdrawMarked = withdrawals.some((w) => w.pack === pack && w.slot === entry.slot)
  const standListing = standListings.find((l) => l.bankPack === pack && l.bankSlot === entry.slot)
  const deconstructible = canDeconstruct(entry.item, deconstructionCatalog)

  const run = async (action: () => Promise<{ kind: string; message?: string }>) => {
    const result = await action()
    if (result.kind === 'failure') setError(result.message ?? 'Request failed')
    else setError(null)
    await refreshNow()
  }

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
      {expanded && (
        <>
          {standForm ? (
            <div className="mt-1.5 flex items-end gap-2 pl-1">
              <label className="flex-1 text-xs text-muted-foreground">
                Price
                <Input value={standPrice} onChange={(e) => /^\d*$/.test(e.target.value) && setStandPrice(e.target.value)} className="mt-1" />
              </label>
              <Button
                size="sm"
                onClick={async () => {
                  await run(() =>
                    api.markForStand(entry.item, entry.slot, Number(standPrice) || 0, {
                      bankPack: pack,
                      quantity: standForm === 'all' ? (entry.item.q ?? 1) : 1,
                    }),
                  )
                  setStandForm(null)
                }}
              >
                List
              </Button>
              <Button size="sm" variant="outline" onClick={() => setStandForm(null)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-3 pl-1">
              <button
                className="text-xs text-primary underline disabled:opacity-50"
                disabled={!merchant}
                onClick={() => void run(() => api.withdrawFromBank(merchant!, entry.item, pack, entry.slot))}
              >
                {withdrawMarked ? 'Unmark withdrawal' : 'Mark for withdrawal'}
              </button>
              <button
                className="text-xs text-primary underline disabled:opacity-50"
                disabled={!merchant}
                onClick={() => void run(() => api.withdrawFromBank(merchant!, entry.item, pack, entry.slot, true))}
              >
                Mark all for withdrawal
              </button>

              {standListing ? (
                <button
                  className="text-xs text-primary underline"
                  onClick={() =>
                    void run(() =>
                      api.markForStand(entry.item, entry.slot, standListing.price, { bankPack: pack, remove: true, id: standListing.id }),
                    )
                  }
                >
                  Unmark for stand
                </button>
              ) : (
                <>
                  <button
                    className="text-xs text-primary underline"
                    onClick={() => {
                      setStandForm('single')
                      setStandPrice(entry.item.price != null ? String(entry.item.price) : '')
                    }}
                  >
                    Mark for stand
                  </button>
                  <button
                    className="text-xs text-primary underline"
                    onClick={() => {
                      setStandForm('all')
                      setStandPrice(entry.item.price != null ? String(entry.item.price) : '')
                    }}
                  >
                    Mark all for stand
                  </button>
                </>
              )}

              {deconstructible && (
                <>
                  <button
                    className="text-xs text-primary underline"
                    onClick={() => void run(() => api.markBankItemForDeconstruction(entry.item, pack, entry.slot))}
                  >
                    Mark for deconstruction
                  </button>
                  <button
                    className="text-xs text-primary underline"
                    onClick={() => void run(() => api.markBankItemForDeconstruction(entry.item, pack, entry.slot, true))}
                  >
                    Mark all for deconstruction
                  </button>
                </>
              )}

              <button className="text-xs text-destructive underline" onClick={() => void run(() => api.sellBankItemToNpc(entry.item, pack, entry.slot))}>
                Sell to NPC
              </button>
              <button
                className="text-xs text-destructive underline"
                onClick={() => void run(() => api.sellBankItemToNpc(entry.item, pack, entry.slot, entry.item.q ?? 1))}
              >
                Sell all to NPC
              </button>
            </div>
          )}
          {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
        </>
      )}
    </div>
  )
}
