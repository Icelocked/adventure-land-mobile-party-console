import { useState, type ReactNode } from 'react'
import { Info, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SpriteIcon } from '@/components/SpriteIcon'
import { usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { abbreviatedGold } from '@/lib/gold'
import { npcSaleValue } from '@/lib/itemFormulas'
import { exactLevelPrice, suggestedItemValue, type StandPriceHistory } from '@/lib/suggestedItemValue'
import type { ApiResult, CommandResult, WtbOptions } from '@/api/partyApi'
import type { CatalogItem, Item, ItemMeta, MerchantBuyItem, StandBid } from '@/models'

/** wtb-preferences.tsx explanations, verbatim. */
export const standBuyExplanation =
  'Uses a merchant stand slot to advertise this buy order to other players. Automatic shopping continues whether this is enabled or disabled.'
export const higherLevelExplanation =
  'Also buy higher-level items at or below your price. Disable for exact-level purchases, such as crafting ingredients.'
export const autoStandExplanation =
  'Automatically uses an empty stand slot for a highest priority buy order. A new sell listing takes this slot when needed; your stand-slot preference stays unchecked.'

/** A small "i" that toggles its explanation (the dashboard's hover popover). */
export function InfoToggle({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex">
      <button type="button" aria-label={`Information: ${label}`} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="rounded border border-violet-700 p-1 text-violet-300">
        <Info className="h-3 w-3" />
      </button>
      {open && (
        <span role="note" className="absolute left-0 top-full z-20 mt-1 w-64 rounded border border-violet-600 bg-background p-2 text-xs text-foreground shadow-lg">
          {children}
        </span>
      )}
    </span>
  )
}

/** wtb-preferences.tsx WTBPreference. */
export function WtbPreference({ label, description, checked, onChange, disabled }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 text-xs">
      <label className="flex items-center gap-2">
        <input type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} className="size-4" />
        {label}
      </label>
      <InfoToggle label={label}>{description}</InfoToggle>
    </div>
  )
}

/** wtbpriority-input.tsx: 0–100, blank = routine priority. */
export function WtbPriorityInput({
  value,
  onChange,
  className = '',
  ...rest
}: {
  value: string
  onChange: (value: string) => void
  className?: string
  onBlur?: React.FocusEventHandler<HTMLInputElement>
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
  disabled?: boolean
}) {
  return (
    <Input
      aria-label="Priority override"
      title="0–100, higher first; blank uses routine priority"
      inputMode="numeric"
      placeholder="Default"
      value={value}
      onChange={(event) => {
        const next = event.target.value.replace(/[^0-9]/g, '')
        onChange(next === '' ? '' : String(Math.min(100, Number(next))))
      }}
      className={className}
      {...rest}
    />
  )
}

const TONES = {
  amber: 'border-amber-700 text-amber-500',
  emerald: 'border-emerald-700 text-emerald-500',
  cyan: 'border-cyan-700 text-cyan-500',
  violet: 'border-violet-700 text-violet-400',
  slate: 'border-slate-600',
}
export type PriceTone = keyof typeof TONES

/** stand-price-button.tsx. */
export function StandPriceButton({ label, value, disabled, onClick, tone, information }: { label: string; value?: number; disabled?: boolean; onClick: () => void; tone: PriceTone; information?: ReactNode }) {
  const usable = Number.isFinite(value) && Number(value) > 0 ? Number(value) : 0
  return (
    <div className="relative w-full">
      <Button size="sm" variant="outline" disabled={disabled} onClick={onClick} className={`h-auto min-h-14 w-full flex-col gap-0.5 px-3 py-2 ${TONES[tone]}`}>
        <span className="font-semibold">{label}</span>
        <span className="font-mono text-[11px] opacity-75">{usable ? `${abbreviatedGold(Math.max(1, Math.round(usable)))} gold` : 'Unavailable'}</span>
      </Button>
      {information && <div className="absolute right-1 top-1">{information}</div>}
    </div>
  )
}

/** ponty-price.tsx, verbatim: 2 × the item's calculated value (3 × for cash
 *  items), inferring upgrade/compound when lightweight meta omits it. */
export function pontyPrice(item: Item, meta?: ItemMeta | null) {
  const definition = meta?.definition || {}
  const level = Math.max(0, Number(item.level) || 0)
  const compoundTypes = new Set(['ring', 'earring', 'amulet', 'belt', 'orb'])
  const compoundable = !!(meta?.compoundable || definition.compound || Number(meta?.maxLevel) === 7 || (level && compoundTypes.has(String(definition.type || ''))))
  const upgradeable = !!(meta?.upgradeable || definition.upgrade || Number(meta?.maxLevel) === 13 || (level && !compoundable))
  const pricingMeta: ItemMeta = { ...(meta || { definition, sprite: null }), definition, compoundable, upgradeable }
  return npcSaleValue(level, !!item.gift, item.expires, pricingMeta) * (definition.cash ? 3 : 2)
}

type Occupant = { id: string; itemId: string; kind: string; price: number; quantity: number }

/** wtb-preferences.tsx useWTBReplacement: a 409 with `occupants` asks which
 *  stand entry to bounce, then retries with replaceStandEntry. */
export function useWtbReplacement(catalogFor: (id: string) => CatalogItem | undefined) {
  const [pending, setPending] = useState<{ occupants: Occupant[]; action: (replacement?: string) => Promise<ApiResult<CommandResult>>; onDone?: () => void } | null>(null)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const refreshNow = useRefreshDynamicStateNow()
  async function save(action: (replacement?: string) => Promise<ApiResult<CommandResult>>, onDone?: () => void) {
    setError('')
    const result = await action()
    if (result.kind === 'success') {
      await refreshNow()
      onDone?.()
      return true
    }
    if (Array.isArray(result.body?.occupants)) {
      setSelected('')
      setPending({ occupants: result.body.occupants as Occupant[], action, onDone })
    } else setError(result.message || 'Could not save WTB')
    return false
  }
  const dialog = (
    <>
      {pending && (
        <div role="dialog" aria-label="Make room for a buy order" className="fixed inset-0 z-[60] flex flex-col bg-background">
          <div className="border-b border-border p-3">
            <p className="text-base font-semibold">Make room for a buy order</p>
            <p className="text-sm text-muted-foreground">All stand slots are full. Which item would you like to remove to make room for the buy order?</p>
          </div>
          <div role="radiogroup" aria-label="Stand listing to replace" className="flex-1 space-y-2 overflow-y-auto p-3">
            {pending.occupants.map((entry) => {
              const item = catalogFor(entry.itemId)
              const active = selected === entry.id
              return (
                <label key={entry.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${active ? 'border-violet-400 bg-violet-950/40' : 'border-border'}`}>
                  <input type="radio" name="stand-replacement" value={entry.id} checked={active} disabled={saving} onChange={() => setSelected(entry.id)} className="size-4" />
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded border border-border">
                    {item?.sprite ? <SpriteIcon sprite={item.sprite} size={40} /> : <Package className="h-6 w-6 text-muted-foreground" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item?.name || entry.itemId}</span>
                    <span className="block text-xs tabular-nums text-muted-foreground">
                      {entry.quantity.toLocaleString()} at {entry.price.toLocaleString()}g each
                    </span>
                  </span>
                  <span className={`rounded border px-2 py-1 text-xs ${entry.kind === 'sale' ? 'border-amber-700 text-amber-500' : 'border-violet-600 text-violet-400'}`}>{entry.kind === 'sale' ? 'Selling' : 'Buying'}</span>
                </label>
              )
            })}
          </div>
          <p className="px-3 text-xs text-muted-foreground">The selected sale will be paused, or the selected buy order will keep shopping automatically without using a stand slot.</p>
          {error && (
            <p role="alert" className="px-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-border p-3">
            <Button variant="outline" disabled={saving} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              disabled={!selected || saving}
              onClick={async () => {
                setSaving(true)
                const result = await pending.action(selected)
                setSaving(false)
                if (result.kind === 'failure') return setError(result.message || 'Could not replace listing')
                const done = pending.onDone
                setPending(null)
                await refreshNow()
                done?.()
              }}
            >
              Replace listing
            </Button>
          </div>
        </div>
      )}
      {!pending && error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  )
  return { save, dialog }
}

/** wtborder-dialog.tsx: price (15 presets at the exact level, existing price
 *  only when its level matches), quantity, +level, priority, Use stand and
 *  Accept higher levels, and the stand-replacement retry. */
export function WtbDialog({
  item,
  meta,
  catalogFor,
  buyable,
  history,
  existing,
  onClose,
}: {
  item: Item
  meta?: ItemMeta | null
  catalogFor: (id: string) => CatalogItem | undefined
  buyable: MerchantBuyItem[]
  history?: StandPriceHistory
  existing?: StandBid
  onClose: () => void
}) {
  const api = usePartyApi()
  const [price, setPrice] = useState(() => (existing && Number(existing.minimumQuality || 0) === Number(item.level || 0) ? String(existing.price) : ''))
  const [quantity, setQuantity] = useState(() => (existing ? String(existing.quantity) : '1'))
  const [level, setLevel] = useState(() => String(item.level ?? 0))
  const [saving, setSaving] = useState(false)
  const [useStandSlot, setUseStandSlot] = useState(existing?.useStandSlot === true)
  const [acceptHigherLevels, setAcceptHigherLevels] = useState(existing?.acceptHigherLevels !== false)
  const [priorityOverride, setPriorityOverride] = useState(() => (existing?.priorityOverride == null ? '' : String(existing.priorityOverride)))
  const replacement = useWtbReplacement(catalogFor)
  const leveled = !!(meta?.upgradeable || meta?.compoundable)
  const previewItem = { ...item, level: Math.max(0, Number(level) || 0) }
  const valuation = suggestedItemValue({ slot: -1, item: previewItem, meta }, buyable)
  const defaultPrice = Math.max(1, Number(meta?.definition.g) || valuation.defaultPrice || 1)
  const npcPrice = Math.max(1, npcSaleValue(previewItem.level, !!previewItem.gift, previewItem.expires, meta ?? undefined))
  const pontyValue = Math.max(1, pontyPrice(previewItem, meta))
  const marketLow = exactLevelPrice(history?.marketLow, history?.marketLowLevel, previewItem.level)
  const lowest = exactLevelPrice(history?.lowest, history?.lowestLevel, previewItem.level)
  const recent = exactLevelPrice(history?.recent, history?.recentLevel, previewItem.level)
  const highestWTB = exactLevelPrice(history?.highestPublicWTB, history?.highestPublicWTBLevel, previewItem.level)
  const marketReference = marketLow || lowest
  const apply = (value?: number) => {
    if (value) setPrice(String(Math.max(1, Math.round(value))))
  }
  const buttons: [string, number | undefined, PriceTone][] = [
    ['Farm price', valuation.suggested, 'amber'],
    ['NPC sale +10%', npcPrice * 1.1, 'emerald'],
    ['Ponty price', pontyValue, 'violet'],
    ['Base value −10%', defaultPrice * 0.9, 'emerald'],
    ['Base value (+0)', defaultPrice, 'emerald'],
    ['Base value +10%', defaultPrice * 1.1, 'emerald'],
    ['Market low −5%', marketReference ? marketReference * 0.95 : undefined, 'cyan'],
    ['Market price', marketLow, 'cyan'],
    ['Highest WTB price', highestWTB, 'violet'],
    ['Lowest seen', lowest, 'cyan'],
    ['Recent +5%', recent ? recent * 1.05 : undefined, 'violet'],
    ['Recent price', recent, 'violet'],
    ['Recent −5%', recent ? recent * 0.95 : undefined, 'violet'],
    ['Input +5%', Number(price) ? Number(price) * 1.05 : undefined, 'slate'],
    ['Input −5%', Number(price) ? Number(price) * 0.95 : undefined, 'slate'],
  ]
  const name = String(meta?.definition.name || catalogFor(item.name)?.name || item.name)

  return (
    <div role="dialog" aria-label="Add to WTB" className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="flex min-w-0 items-center gap-2">
          <SpriteIcon sprite={catalogFor(item.name)?.sprite} size={32} />
          <span className="truncate text-sm font-medium">
            Add to WTB · {name}
            {leveled || previewItem.level ? ` +${previewItem.level}` : ''}
          </span>
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <p className="text-xs text-muted-foreground">Automatic shopping buys matching items at no more than your bid. Native stand orders advertise the selected exact level.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs text-muted-foreground">
            Maximum price
            <Input inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value.replace(/[^0-9]/g, ''))} className="text-right font-mono" />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Quantity
            <Input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^0-9]/g, ''))} className="text-right font-mono" />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Selected +level
            <Input inputMode="numeric" value={level} disabled={!leveled} onChange={(event) => setLevel(event.target.value.replace(/[^0-9]/g, ''))} className="text-right font-mono" />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Priority override
            <WtbPriorityInput className="text-right font-mono" value={priorityOverride} onChange={setPriorityOverride} />
          </label>
        </div>
        <WtbPreference label="Use stand" description={standBuyExplanation} checked={useStandSlot} onChange={setUseStandSlot} />
        {leveled && <WtbPreference label="Accept higher levels" description={higherLevelExplanation} checked={acceptHigherLevels} onChange={setAcceptHigherLevels} />}
        <p className="text-xs text-muted-foreground">Priority: 0–100, higher first. Leave blank to use the routine priority.</p>
        <div className="grid grid-cols-2 gap-2">
          {buttons.map(([label, value, tone]) => (
            <StandPriceButton
              key={label}
              label={label}
              value={value}
              disabled={!value}
              onClick={() => apply(value)}
              tone={tone}
              information={
                label === 'Farm price' ? (
                  <InfoToggle label="Farm price">
                    Estimated gold you would earn while farming enough monsters to obtain one of this item, based on its drop rate and those monsters&apos; gold rewards.
                  </InfoToggle>
                ) : undefined
              }
            />
          ))}
        </div>
        {replacement.dialog}
      </div>
      <div className="flex justify-end gap-2 border-t border-border p-3">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={saving || !Number(price) || !Number(quantity)}
          onClick={async () => {
            setSaving(true)
            await replacement.save(
              (replaceStandEntry) =>
                api.saveBid(item.name, Number(price), Number(quantity), Math.max(0, Number(level) || 0), false, priorityOverride === '' ? null : Number(priorityOverride), {
                  useStandSlot,
                  acceptHigherLevels,
                  replaceStandEntry,
                } satisfies WtbOptions),
              onClose,
            )
            setSaving(false)
          }}
        >
          {saving ? 'Saving…' : 'Place WTB'}
        </Button>
      </div>
    </div>
  )
}
