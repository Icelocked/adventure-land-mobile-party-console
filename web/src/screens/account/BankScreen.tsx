import { useRef, useState } from 'react'
import { usePartyApi, useCharacters, useDynamicState, useRefreshDynamicStateNow, useDomainInterest } from '@/data/PartyDataProvider'
import { useCatalogLookup, displayName } from '@/lib/catalogLookup'
import { SpriteIcon } from '@/components/SpriteIcon'
import { ExpandChevron } from '@/components/ExpandChevron'
import { Input } from '@/components/ui/input'
import { BankItemPanel } from '@/screens/itempanel/BankItemPanel'
import { abbreviatedGold } from '@/lib/gold'
import { Button } from '@/components/ui/button'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'
import { automaticCommerceRuleKey, sameMarkedItem } from '@/models'
import { MluckClover } from '@/components/ItemTileParts'
import type { BankVault, CatalogItem, CharacterState, InventoryEntry } from '@/models'

/** Shared bank vault browser. Item actions: mark/unmark for withdrawal
 *  (always to the configured merchant), mark for stand, deconstruction
 *  (only for deconstructible items) and NPC sale. Tap a row for its options.
 *  Console: bank-sheet.tsx. */
export function BankScreen() {
  useDomainInterest('bank')
  const dynamicState = useDynamicState()
  const characters = useCharacters()
  const refreshNow = useRefreshDynamicStateNow()
  const catalogFor = useCatalogLookup(dynamicState.merchantCatalog)
  const [opened, setOpened] = useState<{ pack: string; entry: InventoryEntry } | null>(null)
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  // Matches item id or name; non-matches are dimmed.
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
      <AdditionalStorageSection />
      <div className="px-3 pb-3">
        <Input type="search" aria-label="Search bank items" placeholder="Search by item name or ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {!bank || Object.keys(bank.packs).length === 0 ? (
        <EmptyState message="No snapshot yet. Send a character to the bank once to load it." />
      ) : (
        <div className="flex flex-col gap-3 px-3">
          {Object.entries(bank.packs).map(([packName, entries]) => {
            const filled = entries.filter((e): e is InventoryEntry => e != null)
            // items1's last 7 slots are reserved and never usable, even
            // though the pack reports a full 42-length array, so they're
            // excluded to keep "free" from overstating deposit room.
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
      <BankboisSection catalogFor={catalogFor} matches={matches} onOpen={(pack, entry) => setOpened({ pack, entry })} />
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

/** One-shot "Sort on next visit" toggle, separate from the standing
 *  automatic/on-request mode in Merchant settings. Only shown while that mode is "request". */
function BankSortToggle({ pending }: { pending?: { status: 'queued' | 'sorting' | 'retry'; message?: string } | null }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const statusLabel = pending?.status === 'sorting' ? 'Sorting' : pending?.status === 'retry' ? `Retry pending${pending.message ? `: ${pending.message}` : ''}` : pending ? 'Queued' : ''
  return (
    <div className="mx-3 mb-3 flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant={pending ? 'default' : 'outline'}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            const result = await api.requestBankSort(!pending)
            if (result.kind === 'failure') setError(result.message || 'Could not update bank sorting')
            else await refreshNow()
            setBusy(false)
          }}
        >
          Sort on next visit · {pending ? 'On' : 'Off'}
        </Button>
        {statusLabel && <span className="text-xs text-muted-foreground">{statusLabel}</span>}
      </div>
      <p className="text-xs text-muted-foreground">Sorts all accessible bank floors after banking work. Compatible stacks are always combined, even when sorting is off. Does not send the merchant to the bank. If already banking, waits for the following visit.</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

const FLOOR_NAMES: Record<string, string> = { bank: 'Main bank', bank_b: 'Bank basement', bank_u: 'Bank underground' }

/** "Additional bank storage": each floor, whether it's
 *  accessible (or which key unlocks it, and how many are owned), and the
 *  purchasable vaults on accessible floors - every unlock confirmed first
 *  and sent through the configured merchant. */
function AdditionalStorageSection() {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const state = useDynamicState()
  const characters = useCharacters()
  const merchant = state.merchantCharacter ?? null
  const vaults = state.bankVaults
  const bank = state.bank
  const [unlocking, setUnlocking] = useState<{ vault: BankVault; kind: 'key' | 'gold' } | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!vaults.length) return null
  const unlocked = new Set(Object.keys(bank?.packs ?? {}))
  // Keys held in the merchant's inventory plus every bank pack.
  const keyQuantity = (key: string) => {
    let quantity = (merchant ? (characters[merchant]?.inventory?.items ?? []) : []).reduce((sum, entry) => sum + (entry?.item.name === key ? Number(entry.item.q || 1) : 0), 0)
    for (const entries of Object.values(bank?.packs ?? {})) for (const entry of entries) if (entry?.item.name === key) quantity += Number(entry.item.q || 1)
    return quantity
  }
  const floorAccessible = (floor: string) => floor === 'bank' || vaults.some((vault) => vault.floor === floor && vault.gold === 0 && unlocked.has(vault.pack))

  return (
    <section aria-label="Additional bank storage" className="mx-3 mb-3 flex flex-col gap-3 rounded-md border border-border bg-card p-3">
      <span className="text-sm font-medium">Additional bank storage</span>
      {[...new Set(vaults.map((vault) => vault.floor))].map((floor) => {
        const accessible = floorAccessible(floor)
        const floorVaults = vaults.filter((vault) => vault.floor === floor)
        const key = floorVaults.find((vault) => vault.key)?.key
        const ownedKeys = key ? keyQuantity(key.id) : 0
        const locked = floorVaults.filter((vault) => !unlocked.has(vault.pack) && vault.gold > 0)
        return (
          <div key={floor} className="rounded-md border border-border p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{FLOOR_NAMES[floor] || floor}</p>
                <p className={`text-[10px] uppercase ${accessible ? 'text-emerald-500' : 'text-destructive'}`}>
                  {accessible ? 'Accessible' : `Locked${key ? ` · requires ${key.name ?? key.id}` : ''}`}
                </p>
              </div>
              {!accessible && key && (
                <Button size="sm" variant="outline" disabled={!ownedKeys || !merchant} className="h-auto flex-col items-start py-1.5" onClick={() => setUnlocking({ vault: floorVaults[0], kind: 'key' })}>
                  <span>Unlock with {key.name ?? key.id}</span>
                  <span className="font-mono text-[10px]">Owned: {ownedKeys}</span>
                </Button>
              )}
            </div>
            {accessible && locked.length ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {locked.map((vault) => (
                  <Button key={vault.pack} variant="outline" disabled={!merchant} className="h-auto flex-col items-start py-1.5" onClick={() => setUnlocking({ vault, kind: 'gold' })}>
                    <span>Unlock {vault.pack}</span>
                    <span className="font-mono text-xs" title={`${vault.gold.toLocaleString()} gold`}>
                      {abbreviatedGold(vault.gold)} gold
                    </span>
                  </Button>
                ))}
              </div>
            ) : accessible ? (
              <p className="mt-1 text-xs text-muted-foreground">No purchasable locked vaults detected on this floor.</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Vault purchases remain disabled until floor access is unlocked.</p>
            )}
          </div>
        )
      })}
      {unlocking && (
        <div role="group" aria-label={unlocking.kind === 'key' ? 'Unlock bank floor?' : 'Unlock bank vault?'} className="flex flex-col gap-2 rounded-md border border-amber-600/50 p-3">
          <p className="text-sm font-medium">{unlocking.kind === 'key' ? 'Unlock bank floor?' : 'Unlock bank vault?'}</p>
          <p className="text-xs text-muted-foreground">
            {unlocking.kind === 'key'
              ? `${merchant || 'The merchant'} will retrieve and consume ${unlocking.vault.key?.name || 'the required key'} to unlock ${FLOOR_NAMES[unlocking.vault.floor] || unlocking.vault.floor}.`
              : `${merchant || 'The merchant'} will spend ${unlocking.vault.gold.toLocaleString()} gold to permanently unlock ${unlocking.vault.pack}.`}
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setUnlocking(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                const { vault, kind } = unlocking
                setUnlocking(null)
                setError(null)
                const result = await api.unlockBankVault(vault.pack, kind)
                if (result.kind === 'failure') setError(result.message)
                await refreshNow()
              }}
            >
              Confirm unlock
            </Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </section>
  )
}

/** "Bankbois": overflow storage workers - create one (the
 *  first reserves 7 slots of bank pane 1, so it asks), each one's state,
 *  load and error, its items (the same options as a bank item, on pack
 *  bankboi:NAME), and a two-step delete once it's empty. */
function BankboisSection({ catalogFor, matches, onOpen }: { catalogFor: (id: string) => CatalogItem | undefined; matches: (entry: InventoryEntry) => boolean; onOpen: (pack: string, entry: InventoryEntry) => void }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const state = useDynamicState()
  const bankbois = state.bankbois
  const prefix = state.bankboiPrefix.trim()
  const [busy, setBusy] = useState(false)
  const [confirmFirst, setConfirmFirst] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const creating = useRef(false)

  const create = async () => {
    if (creating.current) return
    creating.current = true
    setBusy(true)
    setResult(null)
    const response = await api.createBankboi()
    if (response.kind === 'failure') setResult({ ok: false, message: response.message || 'Bankboi creation failed' })
    else {
      setConfirmFirst(false)
      const name = String((response.value.data?.bankboi as { name?: string } | undefined)?.name || 'bankboi')
      setResult({ ok: true, message: `${name} created · provisioning queued` })
      await refreshNow()
    }
    creating.current = false
    setBusy(false)
  }

  return (
    <section aria-label="Bankbois" className="mx-3 mb-3 flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Bankbois</p>
          <p className="text-xs text-muted-foreground">Transparent overflow storage · {(state.bankboiQueue ?? []).length} staged or waiting</p>
        </div>
        <Button size="sm" disabled={busy || !prefix} onClick={() => (bankbois.length ? void create() : setConfirmFirst(true))}>
          {busy ? 'Creating…' : 'Create bankboi'}
        </Button>
      </div>
      {!prefix && <p role="alert" className="text-sm text-destructive">Set bankboi name in settings first</p>}
      {confirmFirst && (
        <div role="group" aria-label="Create first BankBoi?" className="flex flex-col gap-2 rounded-md border border-border p-2.5">
          <p className="text-sm font-medium">Create first BankBoi?</p>
          <p className="text-xs text-muted-foreground">This will reserve 7 slots from bank pane 1 for BankBoi logistics.</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmFirst(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void create()}>
              {busy ? 'Creating…' : 'Create BankBoi'}
            </Button>
          </div>
        </div>
      )}
      {result && (
        <output className={`text-xs ${result.ok ? 'text-emerald-500' : 'text-destructive'}`}>
          {result.ok ? 'Success: ' : 'Failed: '}
          {result.message}
        </output>
      )}
      {deleteError && <p role="alert" className="text-xs text-destructive">{deleteError}</p>}
      {bankbois.length ? (
        bankbois.map((bankboi) => {
          const items = bankboi.items ?? []
          const occupied = items.filter(Boolean).length
          const empty = occupied === 0 && !Object.keys(bankboi.slots || {}).length && !Number(bankboi.gold)
          const pack = `bankboi:${bankboi.name}`
          return (
            <div key={bankboi.name} className="rounded-md border border-border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-sm">{bankboi.name}</span>
                  <span className="ml-2 font-mono text-[10px] uppercase text-muted-foreground">
                    {bankboi.transaction ? `${bankboi.transaction.mode} · ${bankboi.transaction.phase}` : bankboi.state}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{occupied}/42</span>
                  <Button
                    size="xs"
                    variant={deleting === bankboi.name ? 'destructive' : 'outline'}
                    disabled={!empty}
                    onClick={async () => {
                      if (deleting !== bankboi.name) return setDeleting(bankboi.name)
                      setDeleteError(null)
                      const response = await api.deleteBankboi(bankboi.name)
                      setDeleting(null)
                      if (response.kind === 'failure') setDeleteError(response.message)
                      else await refreshNow()
                    }}
                  >
                    {deleting === bankboi.name ? 'Really? ×' : 'Delete'}
                  </Button>
                </div>
              </div>
              {bankboi.error && <p className="mt-1 text-xs text-destructive">{bankboi.error}</p>}
              <div className="mt-2 flex flex-col gap-1">
                {items.map((entry) => entry && <BankRow key={`${pack}:${entry.slot}`} entry={entry} pack={pack} catalogFor={catalogFor} dimmed={!matches(entry)} onOpen={() => onOpen(pack, entry)} />)}
              </div>
            </div>
          )
        })
      ) : (
        <p className="py-2 text-center text-xs text-muted-foreground">No bankbois yet. Reserved overflow cargo will wait safely until one is created.</p>
      )}
    </section>
  )
}

/** One bank item as a list row: every pending mark shows at
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
  const autoStand = state.autoStandMarks[automaticCommerceRuleKey(item)] as { price?: number } | undefined
  const marks = [withdrawMarked && 'Withdraw', standMarked && !autoStand && 'Stand', npcMarked && 'NPC', deconstructionMarked && 'Deconstruct'].filter(Boolean) as string[]
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-2 rounded-md border bg-card p-2 text-left transition-opacity ${withdrawMarked ? 'border-amber-400' : reserved ? 'border-fuchsia-800' : 'border-border'} ${dimmed ? 'opacity-25' : ''}`}
    >
      <span className="relative shrink-0">
        <SpriteIcon sprite={catalogFor(item.name)?.sprite} size={36} />
        <MluckClover item={item} />
      </span>
      <span className="min-w-0 flex-1 text-sm">
        {displayName(item.name, catalogFor)}
        {item.level ? ` +${item.level}` : ''}
        {item.q != null && item.q > 1 ? ` x${item.q}` : ''}
        {item.stat_type && <span className="ml-1 rounded bg-primary/15 px-1 font-mono text-[10px] uppercase text-primary">{item.stat_type}</span>}
      </span>
      {reserved && <span className="shrink-0 font-mono text-[9px] font-bold tracking-widest text-fuchsia-400">RESERVED</span>}
      {autoStand && (
        <span title={`Auto stand · ${Number(autoStand.price || 0).toLocaleString()}g`} className="shrink-0 rounded border border-amber-700 bg-amber-950 px-1 text-[10px] text-amber-200">
          Auto stand
        </span>
      )}
      {marks.map((label) => (
        <span key={label} className="shrink-0 text-[10px] font-medium uppercase text-amber-500">
          {label}
        </span>
      ))}
    </button>
  )
}
