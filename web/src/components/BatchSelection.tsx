import { createContext, useContext, useState, type ReactNode } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { TapRow } from '@/screens/itempanel/ItemActionPanel'
import { itemMaximumLevel } from '@/lib/itemFormulas'
import type { Item, ItemMeta, PartyStateDynamic } from '@/models'
import type { PartyApiClient } from '@/api/partyApi'

// The owners release's batch select (item-selection.tsx). The dashboard adds items with Ctrl or
// Shift and opens the batch menu from any selected item. The phone has neither key, so a
// "Select" button turns on select mode: each tap then adds or drops an item, and "Actions" opens
// the batch actions as an options list.

/** One selectable item: its key in the container, the item and its catalog meta. */
export interface BatchEntry {
  key: string
  slot: number
  item: Item & { l?: unknown; b?: unknown }
  meta?: ItemMeta
  operation?: unknown
}

/** A selection keeps each key with the item it held, so a slot whose item changes drops out. */
export function useBatchSelection() {
  const [active, setActive] = useState(false)
  const [selected, setSelected] = useState<Record<string, string>>({})
  const identity = (entry: BatchEntry) => JSON.stringify(entry.item)
  const has = (entry: BatchEntry) => selected[entry.key] === identity(entry)
  return {
    active,
    has,
    start: () => setActive(true),
    stop: () => {
      setActive(false)
      setSelected({})
    },
    toggle(entry: BatchEntry) {
      setSelected((previous) => {
        const next = { ...previous }
        if (next[entry.key] === identity(entry)) delete next[entry.key]
        else next[entry.key] = identity(entry)
        return next
      })
    },
    of: <T extends BatchEntry>(entries: T[]) => entries.filter(has),
  }
}
export type BatchSelection = ReturnType<typeof useBatchSelection>

/** item-selection.tsx BatchItemActions' handlers. Each one sends one entry's request. */
export interface BatchHandlers {
  onCommand?: (type: 'auto-item-mark' | 'auto-upgrade-mark' | 'auto-compound-mark' | 'auto-exchange' | 'upgrade-mark', entry: BatchEntry, extra: Record<string, unknown>) => Promise<string | null>
  onBank?: (entry: BatchEntry) => Promise<string | null>
  onMerchant?: (entry: BatchEntry) => Promise<string | null>
  onUpgrade?: (entry: BatchEntry) => Promise<string | null>
  onExchange?: (entry: BatchEntry) => Promise<string | null>
  exchangeable?: (entry: BatchEntry) => boolean
  onCompound?: (entry: BatchEntry) => Promise<string | null>
}
type Run = (entry: BatchEntry) => Promise<string | null>

/** BatchItemActions' rows: a locked, bound or busy item turns every row off; upgrade and compound
 *  rows need every item below its top level, and compound needs one level per item name. */
export function batchActions(entries: BatchEntry[], handlers: BatchHandlers): { label: string; run: Run }[] {
  const { onCommand, onBank, onMerchant, onUpgrade, onExchange, exchangeable = () => false, onCompound } = handlers
  const unlocked = entries.length > 0 && entries.every((e) => !e.item.l && !e.item.b && !e.operation)
  const compound =
    unlocked &&
    entries.every((e) => e.meta?.compoundable && (e.item.level || 0) < itemMaximumLevel(e.meta)) &&
    entries.every((entry) => entries.filter((other) => other.item.name === entry.item.name).every((other) => (other.item.level || 0) === (entry.item.level || 0)))
  const unique = entries.filter((entry, index) => entries.findIndex((other) => other.item.name === entry.item.name) === index)
  const upgrade = unlocked && entries.every((e) => e.meta?.upgradeable && (Number(e.item.level) || 0) < itemMaximumLevel(e.meta))
  const rows: { label: string; run: Run }[] = []
  if (unlocked && onBank) rows.push({ label: 'Mark selected for bank', run: onBank })
  if (unlocked && onMerchant) rows.push({ label: 'Mark selected for merchant', run: onMerchant })
  if (unlocked && onCommand) rows.push({ label: 'Auto mark for bank', run: (e) => onCommand('auto-item-mark', e, { mode: 'bank' }) })
  if (upgrade && (onUpgrade || onCommand))
    rows.push({ label: 'Upgrade each by one level', run: (e) => (onUpgrade ? onUpgrade(e) : onCommand!('upgrade-mark', e, { slot: e.slot, tiers: 1 })) })
  if (upgrade && onCommand) rows.push({ label: 'Auto upgrade each by one level', run: (e) => onCommand('auto-upgrade-mark', e, { slot: e.slot, tiers: 1 }) })
  if (unlocked && entries.every(exchangeable) && (onExchange || onCommand))
    rows.push({ label: onExchange ? 'Exchange selected' : 'Auto exchange', run: (e) => (onExchange ? onExchange(e) : onCommand!('auto-exchange', e, { slot: e.slot })) })
  if (compound && onCompound) rows.push({ label: 'Compound each by one level', run: onCompound })
  if (compound && onCommand)
    rows.push({
      label: 'Auto compound each by one level',
      run: async (e) => (unique.includes(e) ? onCommand('auto-compound-mark', e, { targetTier: (e.item.level || 0) + 1 }) : null),
    })
  return rows
}

/** The select mode's bar: the count, the batch actions list and Done. Each action sends one request
 *  per item in order and stops at the first refusal, as BatchItemActions `each` does. */
export function BatchSelectionBar({ selection, entries, handlers, onDone }: { selection: BatchSelection; entries: BatchEntry[]; handlers: BatchHandlers; onDone: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!selection.active) return null
  const chosen = selection.of(entries)
  const rows = batchActions(chosen, handlers)
  const run = async (action: Run) => {
    setBusy(true)
    setError(null)
    for (const entry of chosen) {
      const failure = await action(entry)
      if (failure) {
        setError(failure)
        break
      }
    }
    setBusy(false)
    await onDone()
    setOpen(false)
  }
  return (
    <div role="group" aria-label="Selected items" className="mb-2 flex items-center gap-2 rounded-md border border-sky-700 bg-sky-950/30 p-2 text-sm">
      <span className="flex-1">{chosen.length} selected items</span>
      <Button size="sm" variant="outline" disabled={chosen.length < 2} onClick={() => setOpen(true)}>
        Actions
      </Button>
      <Button size="sm" variant="outline" onClick={selection.stop}>
        Done
      </Button>
      {error && !open && (
        <p role="alert" className="basis-full text-destructive">
          {error}
        </p>
      )}
      {open && (
        <Sheet open onOpenChange={(value) => !value && setOpen(false)}>
          <SheetContent side="bottom" aria-label="Batch actions" className="max-h-[85vh] overflow-y-auto p-4">
            <div className="pb-1 pt-1 text-sm text-muted-foreground">{chosen.length} selected items</div>
            <div className="my-2 border-t border-border" />
            {error && (
              <p role="alert" className="py-1 text-sm text-destructive">
                {error}
              </p>
            )}
            {rows.map((row) => (
              <TapRow key={row.label} label={row.label} disabled={busy} onClick={() => void run(row.run)} />
            ))}
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}

/** exchange-reward-tile.tsx batch menu: the merchant's automatic rules for prospective rewards
 *  (slot -1), where a one-level upgrade is an auto upgrade rule. Item details and the commerce
 *  screen's exchange view share it. */
export function rewardBatchHandlers(api: PartyApiClient, state: PartyStateDynamic): BatchHandlers {
  return {
    onCommand: async (type, entry, extra) => {
      const result = await api.post('command', { character: state.merchantCharacter, type: type === 'upgrade-mark' ? 'auto-upgrade-mark' : type, item: entry.item, ...extra, slot: -1 })
      return result.kind === 'failure' ? result.message || 'Command failed' : null
    },
    exchangeable: (entry) => !!state.merchantCatalog?.exchangeable?.some((choice) => !choice.reward && choice.id === entry.item.name && choice.level === entry.item.level),
  }
}

/** exchange-item-selection.tsx: the reward tiles of one view share a selection. */
const ExchangeSelectionContext = createContext<BatchSelection | null>(null)
export function ExchangeSelectionProvider({ selection, children }: { selection: BatchSelection; children: ReactNode }) {
  return <ExchangeSelectionContext.Provider value={selection}>{children}</ExchangeSelectionContext.Provider>
}
export const useExchangeSelection = () => useContext(ExchangeSelectionContext)
