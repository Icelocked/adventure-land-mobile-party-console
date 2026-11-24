import { createContext, useCallback, useContext, useState } from 'react'
import { itemMaximumLevel } from '@/lib/itemFormulas'
import type { Item, ItemMeta, PartyStateDynamic } from '@/models'
import type { PartyApiClient } from '@/api/partyApi'

// Console v1.5.0 batch select (item-selection.tsx). The dashboard adds items with Ctrl or Shift
// and opens the batch menu from any selected item. The phone has neither key, so a "Select"
// button turns on select mode: each tap then adds or drops an item, and "Actions" opens the
// batch actions as an options list.

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

/** item-selection.tsx BatchItemActions' handlers. Each one sends one entry's request and returns
 *  the refusal message, or null. */
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

/** BatchItemActions' rows. A locked, bound or busy item turns every row off. Upgrade rows need
 *  every item below its top level. Compound rows need every item below +7 and its top level, and
 *  one level per item name. */
export function batchActions(entries: BatchEntry[], handlers: BatchHandlers): { label: string; run: Run }[] {
  const { onCommand, onBank, onMerchant, onUpgrade, onExchange, exchangeable = () => false, onCompound } = handlers
  const unlocked = entries.length > 0 && entries.every((e) => !e.item.l && !e.item.b && !e.operation)
  const compound =
    unlocked &&
    entries.every((e) => e.meta?.compoundable && (e.item.level || 0) < Math.min(7, itemMaximumLevel(e.meta))) &&
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

/** exchange-reward-tile.tsx batch menu: the merchant's automatic rules for prospective rewards
 *  (slot -1), where a one-level upgrade is an auto upgrade rule. */
export function rewardBatchHandlers(api: PartyApiClient, state: PartyStateDynamic): BatchHandlers {
  return {
    onCommand: async (type, entry, extra) => {
      const result = await api.post('command', { character: state.merchantCharacter, type: type === 'upgrade-mark' ? 'auto-upgrade-mark' : type, item: entry.item, ...extra, slot: -1 })
      return result.kind === 'failure' ? result.message || 'Command failed' : null
    },
    exchangeable: (entry) => !!state.merchantCatalog?.exchangeable?.some((choice) => !choice.reward && choice.id === entry.item.name && choice.level === (entry.item.level || 0)),
  }
}

/** exchange-item-selection.tsx: each non-passive reward tile of one view registers itself under
 *  `id@level:detail`, and the tiles share one selection. */
export function useExchangeSelectionState() {
  const selection = useBatchSelection()
  const [entries, setEntries] = useState<BatchEntry[]>([])
  const register = useCallback((entry: BatchEntry) => {
    setEntries((previous) => {
      const index = previous.findIndex((e) => e.key === entry.key)
      if (index >= 0 && JSON.stringify(previous[index]) === JSON.stringify(entry)) return previous
      return index < 0 ? [...previous, entry] : previous.map((old, i) => (i === index ? entry : old))
    })
    return () => setEntries((previous) => previous.filter((e) => e.key !== entry.key))
  }, [])
  return { selection, entries, register }
}
export const ExchangeSelectionContext = createContext<ReturnType<typeof useExchangeSelectionState> | null>(null)
export const useExchangeSelection = () => useContext(ExchangeSelectionContext)

