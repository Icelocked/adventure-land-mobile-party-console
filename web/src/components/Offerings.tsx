import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SpriteIcon } from '@/components/SpriteIcon'
import { usePartyApi, useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { useCatalogLookup } from '@/lib/catalogLookup'
import { itemMaximumLevel } from '@/lib/itemFormulas'
import { UPGRADE_OFFERING_LABELS } from '@/models'
import type { Item, ItemMeta, UpgradeOffering, UpgradeOfferingRule } from '@/models'

// runtime/upgrade-offerings.ts, verbatim.
export const upgradeOfferings = UPGRADE_OFFERING_LABELS
export function offeringOverlap(rules: readonly UpgradeOfferingRule[], next: UpgradeOfferingRule) {
  return rules.find((rule) => rule.id !== next.id && rule.name === next.name && rule.floor < next.ceiling && next.floor < rule.ceiling)
}
// runtime/upgrade-preview.ts previewOptions.
const previewOptions = ['none', 'offeringp', 'offering', 'offeringx'] as const
type PreviewResult = { preview: { chance: number }; observedAt: number } | { reason: string }

/** upgrade-offering-controls.tsx's OfferingSource. */
export type OfferingSource = { slot: number | string; equipped?: boolean }

function OfferingIcon({ name }: { name: string }) {
  const catalogFor = useCatalogLookup(useDynamicState().merchantCatalog)
  const item = catalogFor(name)
  return (
    <span aria-label={item?.name || name} className="relative inline-block h-10 w-10 shrink-0 overflow-hidden rounded border border-border bg-black">
      {item?.sprite && <SpriteIcon sprite={item.sprite} size={40} />}
    </span>
  )
}

/** upgrade-offering-controls.tsx OfferingDialog, inline: with a source it
 *  confirms a one-tier upgrade with that offering ("Confirm upgrade");
 *  without, it adds or edits a standing rule (range, offering, Required /
 *  Only if available) with the overlap and destination checks. Rules and
 *  marks are always saved on the configured merchant. */
export function OfferingDialog({
  character,
  item,
  meta,
  source,
  offering,
  rule: existing,
  onClose,
}: {
  // upgrade-offering-controls.tsx provider `character`: the item's owner (the merchant for rules lists).
  character: string
  item: Item
  meta?: ItemMeta | null
  source?: OfferingSource
  offering?: UpgradeOffering
  rule?: UpgradeOfferingRule
  onClose: () => void
}) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const state = useDynamicState()
  const catalogFor = useCatalogLookup(state.merchantCatalog)
  const stock = state.upgradeOfferingStock ?? {}
  const rules = state.upgradeOfferingRules
  const manual = !!source
  const level = Number(item.level || 0)
  const max = itemMaximumLevel(meta ?? catalogFor(item.name)?.meta ?? undefined)
  const [rule, setRule] = useState<UpgradeOfferingRule>(existing || { id: '', name: item.name, floor: level, ceiling: Math.min(level + 1, max), offering: offering || 'offeringp', required: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const overlap = !manual && offeringOverlap(rules, rule)
  const invalid = overlap
    ? `There is already a rule that covers +${overlap.floor} to +${overlap.ceiling}.`
    : !manual && (rule.floor >= rule.ceiling || rule.ceiling > max)
      ? 'Choose a higher destination level.'
      : manual && !stock[rule.offering]
        ? 'This offering is no longer available.'
        : ''
  const name = catalogFor(item.name)?.name || item.name
  const confirm = async () => {
    if (busy || invalid) return
    setBusy(true)
    setError('')
    const result = manual
      ? await api.sendCommand(character, { type: 'upgrade-mark', item, ...source, tiers: 1, offering: rule.offering })
      : await api.sendCommand(character, { type: 'upgrade-offering-rule', rule })
    setBusy(false)
    if (result.kind === 'failure') return setError(result.message || 'Could not save upgrade')
    await refreshNow()
    onClose()
  }
  const select = 'rounded border border-border bg-background p-1.5 text-sm'
  const title = manual ? 'Confirm upgrade' : existing ? 'Edit upgrade rule' : 'Add upgrade rule'
  return (
    <div role="group" aria-label={title} className="my-1.5 flex flex-col gap-2 rounded-md border border-sky-800 p-2.5 pl-4">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">
        {manual ? `Use ${upgradeOfferings[rule.offering]} to upgrade ${name} from +${level} to +${level + 1}?` : 'Use an offering during automatic upgrades within this level range.'}
      </p>
      <div className="flex items-center gap-2 text-sm">
        <OfferingIcon name={item.name} />
        <span>{name}</span>
      </div>
      {manual ? (
        <div className="flex items-center gap-2 text-sm">
          <OfferingIcon name={rule.offering} />
          {upgradeOfferings[rule.offering]}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            When upgrading from
            <select aria-label="Starting level" className={select} disabled={busy} value={rule.floor} onChange={(event) => setRule({ ...rule, floor: Number(event.target.value) })}>
              {Array.from({ length: max }, (_, n) => (
                <option key={n} value={n}>
                  +{n}
                </option>
              ))}
            </select>
            to
            <select aria-label="Ending level" className={select} disabled={busy} value={rule.ceiling} onChange={(event) => setRule({ ...rule, ceiling: Number(event.target.value) })}>
              {Array.from({ length: max }, (_, n) => n + 1).map((n) => (
                <option disabled={n <= rule.floor} key={n} value={n}>
                  +{n}
                </option>
              ))}
            </select>
            use
            <select aria-label="Upgrade offering" className={select} disabled={busy} value={rule.offering} onChange={(event) => setRule({ ...rule, offering: event.target.value as UpgradeOffering })}>
              {Object.entries(upgradeOfferings).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="space-y-1 text-sm" disabled={busy}>
            <legend className="sr-only">Offering availability</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="offering-mode" checked={rule.required} onChange={() => setRule({ ...rule, required: true })} />
              Required to attempt upgrade
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="offering-mode" checked={!rule.required} onChange={() => setRule({ ...rule, required: false })} />
              Only if item is available
            </label>
          </fieldset>
        </>
      )}
      {(invalid || error) && (
        <p role="alert" className="text-sm text-destructive">
          {invalid || error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" disabled={busy || !!invalid} onClick={() => void confirm()}>
          {busy ? 'Saving…' : 'Confirm'}
        </Button>
      </div>
    </div>
  )
}

/** upgrade-preview-panel.tsx: the merchant's stored server preview for the
 *  next attempt (no offering and each offering), polled every 2 s, with
 *  "Refresh chances" to queue a new one. Only for the merchant's own
 *  inventory items. */
export function UpgradePreviewPanel({ item, source, character }: { item: Item; source?: OfferingSource; character: string }) {
  const api = usePartyApi()
  const executor = useDynamicState().merchantCharacter ?? null
  const refreshBody = useRef<string | null>(null)
  const [revision, refresh] = useState(0)
  const [state, setState] = useState<{ key: string; result?: { options: Record<string, PreviewResult> }; status?: string; error?: string }>()
  const body = JSON.stringify({ character, ...source, item })
  const key = `${body}:${executor}:${revision}`
  const unavailable = !executor ? 'No merchant configured' : !source || source.equipped || character !== executor ? 'Item not in merchant inventory' : ''
  useEffect(() => {
    if (unavailable) return
    const controller = new AbortController()
    let polling = false
    const read = async (queue = false) => {
      if (polling) return
      polling = true
      const result = await api.upgradePreview({ ...JSON.parse(body), refresh: queue }, controller.signal)
      polling = false
      if (controller.signal.aborted) return
      if (result.kind === 'failure') setState({ key, error: result.message })
      else setState({ key, result: result.value.result as { options: Record<string, PreviewResult> } | undefined, status: result.value.status })
    }
    const queue = refreshBody.current === body
    refreshBody.current = null
    void read(queue)
    const timer = setInterval(() => void read(), 2000)
    return () => {
      clearInterval(timer)
      controller.abort()
    }
  }, [api, body, key, unavailable])
  const current = state?.key === key ? state : undefined
  const statusText =
    unavailable ||
    current?.error ||
    (current?.status === 'queued'
      ? 'Queued — waiting for merchant priority'
      : current?.status === 'running'
        ? 'Refreshing chances…'
        : current?.status === 'unavailable'
          ? 'No chances calculated - resolve the missing supplies and refresh'
          : current?.status === 'partial'
            ? 'Some chances saved - see unavailable options below'
            : current?.status === 'complete'
              ? 'Stored preview — valid until the next upgrade'
              : current?.status === 'invalidated'
                ? 'Upgrade performed — refresh chances again'
                : 'Choose Refresh chances to queue a preview')
  return (
    <section aria-label="Upgrade chances" className="my-1.5 rounded-md border border-border p-2.5 text-sm">
      <p className="font-semibold">
        Next attempt: +{item.level || 0} → +{(item.level || 0) + 1}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Server preview{executor ? ` · ${executor}` : ''}</p>
      <p role="status" className="mt-2 text-xs">
        {statusText}
      </p>
      <dl aria-live="polite" className="mt-2 space-y-2">
        {previewOptions.map((option) => {
          const value = current?.result?.options[option]
          return (
            <div key={option} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
              <dt>{option === 'none' ? 'No offering' : upgradeOfferings[option]}</dt>
              <dd className="text-right">
                {value && 'preview' in value ? (
                  <>
                    <span className="font-mono tabular-nums">{(Math.min(1, value.preview.chance) * 100).toFixed(2)}%</span>
                    <span className="block text-xs text-muted-foreground">{new Date(value.observedAt).toLocaleTimeString()}</span>
                  </>
                ) : (
                  <span className="block text-xs text-muted-foreground">{unavailable || current?.error || (value && 'reason' in value ? value.reason : 'Not calculated')}</span>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
      <Button
        size="sm"
        variant="outline"
        className="mt-2 w-full"
        disabled={!!unavailable || current?.status === 'queued' || current?.status === 'running'}
        onClick={() => {
          refreshBody.current = body
          refresh((value) => value + 1)
        }}
      >
        Refresh chances
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">Chances can change before upgrading. The server preview excludes the separate lucky-slot roll bonus.</p>
    </section>
  )
}

/** upgrade-actions.tsx's offering rows under Mark for upgrade: "Upgrade with
 *  X" (needs stock and a source) and, beside them, the server preview. */
export function OfferingRows({
  character,
  item,
  meta,
  source,
  enabled = true,
}: {
  character: string
  item: Item
  meta?: ItemMeta | null
  source?: OfferingSource
  enabled?: boolean
}) {
  const stock = useDynamicState().upgradeOfferingStock ?? {}
  const [picked, setPicked] = useState<UpgradeOffering | null>(null)
  return (
    <div className="py-1 pl-4">
      <div className="mt-1 border-t border-border pt-1">
        {(Object.entries(upgradeOfferings) as [UpgradeOffering, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            disabled={!enabled || !stock[id] || !source}
            onClick={() => setPicked(id)}
            className="block w-full rounded-md px-1 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
          >
            Upgrade with {label}
          </button>
        ))}
      </div>
      {picked && <OfferingDialog character={character} item={item} meta={meta} source={source} offering={picked} onClose={() => setPicked(null)} />}
      {enabled && <UpgradePreviewPanel item={item} source={source} character={character} />}
    </div>
  )
}

/** upgrade-actions.tsx's "Add upgrade rule" under Auto mark for upgrade. */
export function AddUpgradeRule({ character, item, meta, enabled = true }: { character: string; item: Item; meta?: ItemMeta | null; enabled?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="pl-4">
      <button type="button" disabled={!enabled} onClick={() => setOpen(true)} className="mt-1 block w-full rounded-md border-t border-border px-1 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50">
        Add upgrade rule
      </button>
      {open && <OfferingDialog character={character} item={item} meta={meta} onClose={() => setOpen(false)} />}
    </div>
  )
}
