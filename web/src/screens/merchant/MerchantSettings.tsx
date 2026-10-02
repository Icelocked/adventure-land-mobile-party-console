import { useEffect, useRef, useState } from 'react'
import { usePartyApi, useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Result = { kind: string; message?: string }

/** One merchant setting's busy/error state - each dashboard setting is its
 *  own mutation with its own inline error. */
function useSetting() {
  const refreshNow = useRefreshDynamicStateNow()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (request: () => Promise<Result>) => {
    setBusy(true)
    setError(null)
    const result = await request()
    setBusy(false)
    if (result.kind === 'failure') setError(result.message ?? 'Request failed')
    else await refreshNow()
    return result.kind !== 'failure'
  }
  return { busy, error, setError, run }
}

const box = 'flex flex-col gap-2 rounded-md border border-border p-3 text-sm'
const help = 'text-xs text-muted-foreground'

/** merchant-collection-settings.tsx's "Merchant settings": bank sorting,
 *  upgrade buy batch, stand location, delivery/withdrawal trips, and the
 *  gold and item collection thresholds. */
export function MerchantSettings() {
  return (
    <div className="flex flex-col gap-3 py-1 pl-3">
      <BankSortSetting />
      <BuyUpgradeBatchSetting />
      <StandLocationSetting />
      <TripSetting kind="deliveries" />
      <TripSetting kind="withdrawals" />
      <ThresholdSettings />
    </div>
  )
}

/** bank-sort-control.tsx (settings mode). */
function BankSortSetting() {
  const api = usePartyApi()
  const state = useDynamicState()
  const { busy, error, run } = useSetting()
  const mode = state.bankSortMode || 'automatic'
  return (
    <fieldset disabled={busy} className={box}>
      <legend className="px-1">Bank sorting</legend>
      {(
        [
          ['automatic', 'Sort every bank visit'],
          ['request', 'Request sorting in bank window'],
        ] as const
      ).map(([value, label]) => (
        <label key={value} className="flex items-center gap-2">
          <input type="radio" name="bank-sort-mode" value={value} checked={mode === value} onChange={() => void run(() => api.setBankSortMode(value))} />
          {label}
        </label>
      ))}
      <p className={help}>Compatible stacks are always combined during bank visits. This setting controls item ordering.</p>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </fieldset>
  )
}

/** buy-upgrade-batch-setting.tsx */
function BuyUpgradeBatchSetting() {
  const api = usePartyApi()
  const value = useDynamicState().buyUpgradeBatchSize ?? 1
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const { busy, error, run } = useSetting()
  const count = Number(draft)
  const valid = Number.isSafeInteger(count) && count >= 1 && count <= 42
  return (
    <fieldset disabled={busy} className={box}>
      <label htmlFor="buy-upgrade-batch">Maximum number to buy at once for upgrading</label>
      <p className={help}>
        Default: 1. Buys up to this many items and their starting-tier scrolls per batch, within available space and order limits. Higher-tier scrolls are bought as
        needed. Every purchased item is finished, so a batch can produce extra target-level items.
      </p>
      <div className="flex gap-2">
        <Input id="buy-upgrade-batch" inputMode="numeric" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <Button size="sm" disabled={!valid} onClick={() => void run(() => api.post('config', { buyUpgradeBatchSize: count }))}>
          Apply
        </Button>
      </div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </fieldset>
  )
}

/** merchant-stand-location-setting.tsx */
function StandLocationSetting() {
  const api = usePartyApi()
  const location = useDynamicState().merchantStandLocation
  const [x, setX] = useState(String(location?.x ?? ''))
  const [y, setY] = useState(String(location?.y ?? ''))
  useEffect(() => {
    setX(String(location?.x ?? ''))
    setY(String(location?.y ?? ''))
  }, [location?.x, location?.y])
  const { busy, error, run } = useSetting()
  const valid = x.trim() !== '' && y.trim() !== '' && Number.isFinite(Number(x)) && Number.isFinite(Number(y))
  return (
    <fieldset disabled={busy} className={box}>
      <legend className="sr-only">Merchant stand location</legend>
      <p className="text-xs font-medium uppercase">Merchant stand location</p>
      <p className={help}>Main map coordinates to return to when opening the stand. The saved position is checked against map obstacles.</p>
      <div className="flex items-end gap-2">
        <label className="flex-1 text-xs text-muted-foreground">
          Stand X
          <Input inputMode="decimal" value={x} onChange={(e) => setX(e.target.value)} className="mt-1" />
        </label>
        <label className="flex-1 text-xs text-muted-foreground">
          Stand Y
          <Input inputMode="decimal" value={y} onChange={(e) => setY(e.target.value)} className="mt-1" />
        </label>
      </div>
      <Button size="sm" disabled={!valid} onClick={() => void run(() => api.post('merchant/stand-location', { map: 'main', x: Number(x), y: Number(y) }))}>
        Save stand location
      </Button>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </fieldset>
  )
}

/** delivery-trip-setting.tsx / withdrawal-trip-setting.tsx */
function TripSetting({ kind }: { kind: 'deliveries' | 'withdrawals' }) {
  const api = usePartyApi()
  const enabled = useDynamicState().merchantAutomations[kind] !== false
  const [pendingChecked, setPendingChecked] = useState<boolean | null>(null)
  const { busy, error, run } = useSetting()
  return (
    <fieldset disabled={busy} className={box}>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={kind === 'withdrawals' ? (pendingChecked ?? enabled) : enabled}
          onChange={async (event) => {
            const checked = event.target.checked
            if (kind === 'withdrawals') setPendingChecked(checked)
            await run(() => api.saveRoutinePriorities({}, { [kind]: checked }))
            setPendingChecked(null)
          }}
          className="size-4"
        />
        {kind === 'deliveries' ? 'Marked deliveries create merchant jobs' : 'Marked withdrawals create merchant jobs'}
      </label>
      <p className={help}>
        {kind === 'deliveries'
          ? 'When disabled, the merchant completes marked deliveries when visiting the party for another reason, such as item collection. It will not make a trip for deliveries alone unless you use Send to party or send the merchant to a specific character.'
          : 'When disabled, marked withdrawals wait until the merchant visits the bank for another reason. When enabled, pending withdrawal marks create a bank trip at the Marked withdrawals routine priority.'}
      </p>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </fieldset>
  )
}

/** merchant-collection-settings.tsx's two thresholds, with
 *  use-party-console.tsx's validation and re-sync while untouched. */
function ThresholdSettings() {
  const api = usePartyApi()
  const state = useDynamicState()
  const [gold, setGold] = useState(String(state.threshold))
  const [slots, setSlots] = useState(String(state.itemCollectionThreshold))
  const goldDirty = useRef(false)
  const slotsDirty = useRef(false)
  useEffect(() => {
    if (!goldDirty.current) setGold(String(state.threshold))
  }, [state.threshold])
  useEffect(() => {
    if (!slotsDirty.current) setSlots(String(state.itemCollectionThreshold))
  }, [state.itemCollectionThreshold])
  const goldSetting = useSetting()
  const slotsSetting = useSetting()
  return (
    <>
      <section aria-label="Automatic gold collection" className={box}>
        <p className="text-xs font-medium uppercase">Automatic gold collection</p>
        <p className={help}>Send the merchant when any active character carries more than this amount.</p>
        <div className="flex items-end gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            Collect above (gold)
            <Input
              inputMode="numeric"
              value={gold}
              onChange={(e) => {
                goldDirty.current = true
                setGold(e.target.value.replace(/[^0-9]/g, ''))
              }}
              className="mt-1"
            />
          </label>
          <Button
            size="sm"
            onClick={async () => {
              const n = Number(gold)
              if (!Number.isSafeInteger(n) || n < 0) return goldSetting.setError('Enter a non-negative whole number')
              if (await goldSetting.run(() => api.setThresholds(n, undefined))) goldDirty.current = false
            }}
          >
            Apply
          </Button>
        </div>
        {goldSetting.error && <p role="alert" className="text-destructive">{goldSetting.error}</p>}
      </section>
      <section aria-label="Automatic item collection" className={box}>
        <p className="text-xs font-medium uppercase">Automatic item collection</p>
        <p className={help}>
          Start a collection trip when one party member has this many marked inventory slots. Smaller pickups run only while the merchant is within 200 units.
          Queued pickups and retries recheck this rule. NPC-sale marks count toward this threshold. Manual visits and other merchant jobs still collect
          immediately.
        </p>
        <div className="flex items-end gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            Marked slots required (1-42)
            <Input
              inputMode="numeric"
              value={slots}
              onChange={(e) => {
                slotsDirty.current = true
                setSlots(e.target.value.replace(/[^0-9]/g, ''))
              }}
              className="mt-1"
            />
          </label>
          <Button
            size="sm"
            onClick={async () => {
              const value = Number(slots)
              if (!Number.isSafeInteger(value) || value < 1 || value > 42) return slotsSetting.setError('Use an item-slot threshold from 1 to 42')
              if (await slotsSetting.run(() => api.setThresholds(undefined, value))) slotsDirty.current = false
            }}
          >
            Apply
          </Button>
        </div>
        {slotsSetting.error && <p role="alert" className="text-destructive">{slotsSetting.error}</p>}
      </section>
    </>
  )
}
