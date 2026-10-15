import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SpriteIcon } from '@/components/SpriteIcon'
import { usePartyApi, useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { useCatalogLookup } from '@/lib/catalogLookup'
import { itemMaximumLevel } from '@/lib/itemFormulas'
import { UPGRADE_OFFERING_LABELS } from '@/models'
import type { Item, ItemMeta, UpgradeOffering, UpgradeOfferingRule } from '@/models'

// Console: runtime/upgrade-offerings.ts.
export const upgradeOfferings = UPGRADE_OFFERING_LABELS
export function offeringOverlap(rules: readonly UpgradeOfferingRule[], next: UpgradeOfferingRule) {
  return rules.find((rule) => rule.id !== next.id && rule.name === next.name && rule.floor < next.ceiling && next.floor < rule.ceiling)
}
export function offeringRule(rules: readonly UpgradeOfferingRule[], name: string, level: number) {
  return rules.find((rule) => rule.name === name && rule.floor <= level && level < rule.ceiling)
}

/** Console 1.4 upgrade-actions.tsx destinationOffering: the offering rule
 *  covering the last step of an upgrade to +level+tiers, shown next to that
 *  tier. An optional rule is wrapped in parentheses. Display only. */
export function DestinationOffering({ name, level, tiers }: { name: string; level: number; tiers: number }) {
  const state = useDynamicState()
  const catalogFor = useCatalogLookup(state.merchantCatalog)
  const step = level + tiers - 1
  const rule = offeringRule(state.upgradeOfferingRules ?? [], name, step)
  if (!rule) return null
  const label = upgradeOfferings[rule.offering]
  const sprite = catalogFor(rule.offering)?.sprite
  return (
    <span className="inline-flex items-center gap-1" title={`+${step} → +${step + 1}: ${label} (${rule.required ? 'required' : 'optional'})`}>
      {!rule.required && '('}
      <span role="img" aria-label={label} className="relative inline-block h-5 w-5 overflow-hidden">
        {sprite && <SpriteIcon sprite={sprite} size={20} />}
      </span>
      {!rule.required && ')'}
    </span>
  )
}
const previewOptions = ['none', 'offeringp', 'offering', 'offeringx'] as const
type PreviewResult = { preview: { chance: number; grace?: number }; observedAt: number } | { reason: string }

// Console: runtime/prim-stack.ts. Grace targets run 0.5 to 15 in 0.5 steps.
type PrimStackMethod = 'offering' | 'stat'
const primStackTargets = Array.from({ length: 30 }, (_, index) => (index + 1) / 2)
const statScrollName = (stat: string) => (stat === 'mp_cost' ? 'mpcostscroll' : stat + 'scroll')
/** Stat scrolls one stat application consumes at the item's upgrade grade. */
function statScrollsPerStack(level: number, grades: readonly number[] = [9, 10, 11, 12]) {
  return [1, 10, 100, 1000, 9999][grades.filter((threshold) => level >= threshold).length]!
}

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

/** Offering dialog: with a source it
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
  // The item's owner (the merchant for rules lists).
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
        {manual ? `Use ${upgradeOfferings[rule.offering]} to upgrade ${name} from +${level} to +${level + 1}?` : 'Use an offering during manual and automatic upgrades within this level range.'}
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

/** The merchant's stored server preview for the
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
  // Inventories never carry grace (the server strips it); every calculated option reports it.
  const grace = previewOptions.map((option) => current?.result?.options[option]).find((value) => value && 'preview' in value)
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
      {grace && 'preview' in grace && (
        <p className="mt-2 font-mono text-xs tabular-nums" title="Item grace from the server preview; raise it with Prim stack">
          Grace {grace.preview.grace}
        </p>
      )}
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

/** Offering rows under Mark for upgrade: "Upgrade with
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
  const state = useDynamicState()
  const stock = state.upgradeOfferingStock ?? {}
  const [picked, setPicked] = useState<UpgradeOffering | null>(null)
  const [stacking, setStacking] = useState(false)
  // The coordinator only prim stacks merchant inventory items.
  const canStack = enabled && !!stock.offeringp && !!source && !source.equipped && character === state.merchantCharacter
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
        <button type="button" disabled={!canStack} onClick={() => setStacking(true)} className="block w-full rounded-md px-1 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50">
          Prim stack…
        </button>
      </div>
      {picked && <OfferingDialog character={character} item={item} meta={meta} source={source} offering={picked} onClose={() => setPicked(null)} />}
      {stacking && source && <PrimStackDialog character={character} slot={Number(source.slot)} item={item} meta={meta} onClose={() => setStacking(false)} />}
      {enabled && <UpgradePreviewPanel item={item} source={source} character={character} />}
    </div>
  )
}

/** Console 1.4 prim-stack-dialog.tsx (#65): Primling-only or Primling +
 *  stat-scroll operations that raise grace without a level attempt. */
function PrimStackDialog({ character, slot, item, meta, onClose }: { character: string; slot: number; item: Item; meta?: ItemMeta | null; onClose: () => void }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const state = useDynamicState()
  const catalogFor = useCatalogLookup(state.merchantCatalog)
  const definition = (meta ?? catalogFor(item.name)?.meta)?.definition
  const level = Number(item.level) || 0
  const [target, setTarget] = useState(Math.min(15, level + 2))
  const [method, setMethod] = useState<PrimStackMethod>('offering')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // A stat scroll rewrites stat_type, so only the item's current stat can be used.
  const statType = typeof item.stat_type === 'string' && Number(definition?.stat) ? item.stat_type : null
  const grades = Array.isArray(definition?.grades) ? (definition.grades as unknown[]).map(Number) : undefined
  const scrolls = statScrollsPerStack(level, grades)
  const primlings = state.upgradeOfferingStock?.offeringp || 0
  const name = catalogFor(item.name)?.name || item.name
  const label = (id: string) => catalogFor(id)?.name || id
  const confirm = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    const result = await api.primStack(character, slot, item, target, method)
    setBusy(false)
    if (result.kind === 'failure') return setError(result.message)
    await refreshNow()
    onClose()
  }
  return (
    <div role="group" aria-label="Prim stack" className="my-1.5 flex flex-col gap-2 rounded-md border border-sky-800 p-2.5 pl-4">
      <p className="text-sm font-medium">Prim stack</p>
      <p className="text-xs text-muted-foreground">
        Raise {name}&apos;s hidden grace without attempting an upgrade. Grace stays on the item until it is destroyed; during an upgrade it counts up to the next level + 1, and most when that attempt also uses an offering.
      </p>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        Stack until grace
        <select aria-label="Target grace" className="rounded border border-border bg-background p-1.5 text-sm" disabled={busy} value={target} onChange={(event) => setTarget(Number(event.target.value))}>
          {primStackTargets.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="space-y-1 text-sm" disabled={busy}>
        <legend className="sr-only">Prim-stack method</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="prim-stack-method" checked={method === 'offering'} onChange={() => setMethod('offering')} />
          Primling only (+0.5 grace each)
        </label>
        <label className={`flex items-center gap-2 ${statType ? '' : 'text-muted-foreground'}`}>
          <input type="radio" name="prim-stack-method" disabled={!statType} checked={method === 'stat'} onChange={() => setMethod('stat')} />
          {statType
            ? `Primling + ${scrolls.toLocaleString()} × ${label(statScrollName(statType))} (+1 grace each, keeps ${statType.toUpperCase()})`
            : 'Primling + stat scroll (needs an item with an applied stat)'}
        </label>
      </fieldset>
      <p className="text-xs text-muted-foreground">
        The merchant reads the current grace first and stops at the target. {primlings.toLocaleString()} Primling{primlings === 1 ? '' : 's'} in merchant inventory and storage.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void confirm()}>
          {busy ? 'Queueing…' : 'Stack grace'}
        </Button>
      </div>
    </div>
  )
}

/** "Add upgrade rule" under Auto mark for upgrade. */
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
