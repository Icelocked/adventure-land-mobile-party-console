import { useState } from 'react'
import { Check, PackageOpen, X } from 'lucide-react'
import { usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ExpandChevron } from '@/components/ExpandChevron'
import { ItemDetailBrowser } from '@/screens/itemdetail/ItemDetailBrowser'
import { upgradeRuleTiers } from '@/lib/itemFormulas'
import { SectionCard } from '../SectionCard'
import type { ApiResult, CommandResult } from '@/api/partyApi'
import type { CatalogItem, Item, PartyStateDynamic } from '@/models'
import { itemFromRuleKey } from '@/models'

type Action = () => Promise<ApiResult<CommandResult>>

interface RuleEdit {
  id: string
  value: number
  label: string
  min: number
  max: number
  allowUnlimited?: boolean
  onSave: (value: number) => Action
}

interface RuleEntry {
  key: string
  item: Item
  detail?: string
  // A running mark can't be removed; a blocked one can be retried.
  disabled?: boolean
  retry?: Action
  upgradeTarget?: number
  edits?: RuleEdit[]
  onRemove: Action
}

/** upgrade-rule-quantity.tsx, verbatim. */
const upgradeRuleQuantity = (rule?: unknown) =>
  typeof rule === 'object' && rule && Number.isSafeInteger(Number((rule as { quantity?: unknown }).quantity)) ? Number((rule as { quantity?: unknown }).quantity) : -1

/** inventory-panel.tsx's automatic sections (merchant only): NPC sales,
 *  deconstruction, stand, upgrades, compounds, merchant marks and bank
 *  marks - each with a two-tap clear, two-tap remove per entry, inline
 *  target/remaining edits for upgrade and compound rules, and Retry for a
 *  blocked deconstruction. Every action surfaces its error. */
export function AutoMarksSection({
  characterName,
  isMerchant,
  dynamicState: state,
  catalogFor,
}: {
  characterName: string
  isMerchant: boolean
  dynamicState: PartyStateDynamic
  catalogFor: (id: string) => CatalogItem | undefined
}) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<Item | null>(null)
  if (!isMerchant) return null

  const merchant = state.merchantCharacter ?? characterName
  // connected-inventory.tsx ruleName: shared rules live under the merchant.
  const ruleName = state.merchantRules ? merchant : characterName
  const autoItemMarks = state.autoItemMarks[ruleName] ?? {}
  const perform = async (action: Action) => {
    setError(null)
    const result = await action()
    if (result.kind === 'failure') setError(result.message || 'Automatic rule update failed')
    await refreshNow()
  }

  const npc: RuleEntry[] = [
    ...Object.entries(state.autoNpcSales)
      .filter(([, rule]) => !rule.character)
      .map(([key, rule]) => ({ key, item: rule.item, onRemove: () => api.autoNpcSale(undefined, rule.item, true) })),
    ...state.npcSaleMarks.map((mark) => ({
      key: mark.id,
      item: mark.item,
      detail: `${mark.character || merchant} · ${mark.quantity} × · ${mark.state || 'queued'}${mark.error ? ` · ${mark.error}` : ''}`,
      disabled: mark.state === 'running',
      onRemove: () => api.removeNpcSaleMark(mark.character || characterName, mark.id),
    })),
  ]
  const autoDeconstruction = Object.values(state.autoDeconstruction[ruleName] ?? {})
  const deconstruction: RuleEntry[] = [
    ...Object.entries(state.autoDeconstruction[ruleName] ?? {}).map(([key, rule]) => ({
      key,
      item: rule.item,
      detail: 'Automatic',
      onRemove: () => api.autoDeconstruct(characterName, rule.item, true),
    })),
    ...state.deconstructionMarks
      .filter((mark) => mark.state !== 'complete')
      .map((mark) => ({
        key: mark.id,
        item: mark.item,
        detail: `${mark.owner} · ${mark.quantity} × · ${mark.state}${mark.error ? ` · ${mark.error}` : ''}`,
        disabled: mark.state === 'running',
        retry: mark.state === 'blocked' ? () => api.retryDeconstructionMark(mark.owner || characterName, mark.id) : undefined,
        onRemove: () => api.removeDeconstructionMark(mark.owner || characterName, mark.id, mark.slot, mark.item),
      })),
  ]
  const stand: RuleEntry[] = Object.entries(state.autoStandMarks).map(([key, rule]) => ({
    key,
    item: rule.item,
    detail: `${rule.price.toLocaleString()}g`,
    onRemove: () => api.autoStand(rule.item, rule.price, true),
  }))
  const upgrades: RuleEntry[] = Object.entries(state.autoUpgradeMarks).flatMap(([owner, rules]) =>
    Object.entries(rules).map(([ruleKey, rule]) => {
      const item = itemFromRuleKey(ruleKey)
      const level = Number(item.level || 0)
      const tiers = upgradeRuleTiers(rule)
      const quantity = upgradeRuleQuantity(rule)
      return {
        key: `${owner}:${ruleKey}`,
        item,
        upgradeTarget: level + tiers,
        detail: owner === characterName ? undefined : owner,
        edits: [
          {
            id: 'target',
            value: tiers,
            label: `${tiers} tier${tiers === 1 ? '' : 's'} → +${level + tiers}`,
            min: 1,
            max: Math.max(1, 13 - level),
            onSave: (value: number) => () => api.itemCommand('update-auto-upgrade-rule', owner, item, null, { ruleKey, tiers: value }),
          },
          {
            id: 'quantity',
            value: quantity,
            label: quantity === -1 ? 'Remaining ∞' : quantity === 0 ? 'Completed' : `Remaining ${quantity}`,
            min: 1,
            max: 9999,
            allowUnlimited: true,
            onSave: (value: number) => () => api.itemCommand('update-auto-upgrade-rule', owner, item, null, { ruleKey, quantity: value }),
          },
        ],
        onRemove: () => api.removeAutoUpgradeRule(owner, item, ruleKey),
      }
    }),
  )
  const compounds: RuleEntry[] = Object.entries(state.autoCompounds).flatMap(([owner, rules]) =>
    rules.map((rule) => {
      const quantity = rule.quantity as number | undefined
      return {
        key: `${owner}:${rule.name}`,
        item: { name: rule.name, level: 0 },
        detail: owner === characterName ? undefined : owner,
        edits: [
          {
            id: 'target',
            value: rule.targetTier,
            label: `Target +${rule.targetTier}`,
            min: 1,
            max: 7,
            onSave: (value: number) => () => api.itemCommand('auto-compound-mark', owner, { name: rule.name }, null, { targetTier: value }),
          },
          {
            id: 'quantity',
            value: Number.isSafeInteger(Number(quantity)) ? Number(quantity) : -1,
            label: Number(quantity) === -1 || quantity === undefined ? 'Remaining ∞' : Number(quantity) === 0 ? 'Completed' : `Remaining ${quantity}`,
            min: 1,
            max: 9999,
            allowUnlimited: true,
            onSave: (value: number) => () => api.itemCommand('auto-compound-mark', owner, { name: rule.name }, null, { targetTier: rule.targetTier, quantity: value }),
          },
        ],
        onRemove: () => api.removeAutoCompound(owner, rule.name, rule.targetTier),
      }
    }),
  )
  const markEntries = (mode: 'bank' | 'merchant'): RuleEntry[] =>
    Object.entries(autoItemMarks)
      .filter(([, value]) => value === mode)
      .map(([key]) => ({ key, item: itemFromRuleKey(key), onRemove: () => api.removeAutoItemMark(characterName, mode, key) }))

  const group = (title: string, color: string, entries: RuleEntry[], clear: () => Promise<unknown>) => (
    <AutoRuleGroup key={title} title={title} color={color} entries={entries} catalogFor={catalogFor} perform={perform} onClear={clear} onView={setViewing} />
  )

  return (
    <SectionCard title="Automatic rules">
      {error && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        {group('Auto NPC sales', 'border-rose-800 text-rose-400', npc, () => perform(() => api.clearAllAutoNpcSales(undefined)))}
        {group('Auto deconstruction', 'border-orange-800 text-orange-400', deconstruction, async () => {
          for (const rule of autoDeconstruction) await perform(() => api.autoDeconstruct(characterName, rule.item, true))
        })}
        {group('Auto stand marks', 'border-amber-800 text-amber-400', stand, () => perform(() => api.clearAllAutoStand()))}
        {group('Auto upgrades', 'border-sky-800 text-sky-400', upgrades, () => perform(() => api.clearAutoUpgrades(characterName)))}
        {group('Auto compounds', 'border-fuchsia-800 text-fuchsia-400', compounds, () => perform(() => api.clearAutoCompounds(characterName)))}
        {group('Auto merchant marks', 'border-purple-800 text-purple-400', markEntries('merchant'), () => perform(() => api.clearAutoItemMarks(characterName, 'merchant')))}
        {group('Auto bank marks', 'border-amber-800 text-amber-400', markEntries('bank'), () => perform(() => api.clearAutoItemMarks(characterName, 'bank')))}
      </div>
      {viewing && (
        <Sheet open onOpenChange={(open) => !open && setViewing(null)}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
            <ItemDetailBrowser rootItemId={viewing.name} rootLevel={viewing.level ?? 0} catalog={state.merchantCatalog} monsters={state.bestiaryCatalog} />
          </SheetContent>
        </Sheet>
      )}
    </SectionCard>
  )
}

function AutoRuleGroup({
  title,
  color,
  entries,
  catalogFor,
  perform,
  onClear,
  onView,
}: {
  title: string
  color: string
  entries: RuleEntry[]
  catalogFor: (id: string) => CatalogItem | undefined
  perform: (action: Action) => Promise<void>
  onClear: () => Promise<unknown>
  onView: (item: Item) => void
}) {
  const [open, setOpen] = useState(false)
  const [clearArmed, setClearArmed] = useState(false)
  const [removalArmed, setRemovalArmed] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const stopEditing = () => {
    setEditing(null)
    setValue('')
  }

  return (
    <section aria-label={title} className={`rounded-md border ${color}`}>
      <div className="flex items-stretch">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen((current) => !current)
            setClearArmed(false)
            setRemovalArmed(null)
            stopEditing()
          }}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-xs"
        >
          <ExpandChevron expanded={open} />
          <span className="flex-1">{title}</span>
          <span className="font-mono opacity-70">{entries.length}</span>
        </button>
        <button
          type="button"
          disabled={!entries.length}
          aria-label={clearArmed ? `Really clear all ${title}` : `Clear all ${title}`}
          title={clearArmed ? 'Click again to clear all' : 'Clear all'}
          onClick={async () => {
            if (!clearArmed) {
              setClearArmed(true)
              setRemovalArmed(null)
              return
            }
            setClearArmed(false)
            await onClear()
          }}
          className={`flex shrink-0 items-center justify-center gap-1 border-l px-2 disabled:opacity-30 ${clearArmed ? 'bg-rose-600 text-white' : 'text-rose-400'}`}
        >
          {clearArmed && <span className="text-[10px] font-semibold">Really?</span>}
          <X className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-1 border-t border-current/30 px-3 py-2">
          {!entries.length && <p className="text-xs text-muted-foreground">No active marks.</p>}
          {entries.map((entry) => {
            const definition = catalogFor(entry.item.name)
            const label = `${definition?.name || entry.item.name}${entry.item.level ? ` +${entry.item.level}` : ''}`
            const upgradeRange = entry.upgradeTarget === undefined ? null : `+${Number(entry.item.level || 0)} → +${entry.upgradeTarget}`
            const armed = removalArmed === entry.key
            return (
              <div key={entry.key} className="flex min-h-12 flex-wrap items-center gap-2 border-b border-border py-1 text-xs text-foreground last:border-b-0">
                <button
                  type="button"
                  aria-label={`View ${label}${upgradeRange ? ` · ${upgradeRange}` : ''}`}
                  onClick={() => onView(entry.item)}
                  className={`relative shrink-0 border border-border ${upgradeRange ? 'h-14 w-16' : 'h-10 w-10'}`}
                >
                  <span className={upgradeRange ? 'absolute inset-x-0 top-0 mx-auto grid h-10 w-10 place-items-center' : 'absolute inset-0 grid place-items-center'}>
                    {definition?.sprite ? <SpriteIcon sprite={definition.sprite} size={40} /> : <PackageOpen className="h-5 w-5 text-muted-foreground" />}
                  </span>
                  {upgradeRange ? (
                    <span className="absolute inset-x-0 bottom-0 border-t border-sky-800 bg-sky-950 text-center font-mono text-xs leading-4 text-sky-100">{upgradeRange}</span>
                  ) : entry.item.level ? (
                    <span className="absolute bottom-0 right-0 bg-black px-0.5 font-mono text-[9px] text-amber-200">+{entry.item.level}</span>
                  ) : null}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate">{label}</div>
                  {entry.detail && <div className="truncate text-[10px] text-muted-foreground">{entry.detail}</div>}
                </div>
                {!armed &&
                  entry.edits?.map((edit) => {
                    const fieldKey = `${entry.key}:${edit.id}`
                    const parsed = Number(value)
                    const valid = Number.isSafeInteger(parsed) && ((edit.allowUnlimited && parsed === -1) || (parsed >= edit.min && parsed <= edit.max))
                    const save = () => {
                      stopEditing()
                      void perform(edit.onSave(parsed))
                    }
                    return editing === fieldKey ? (
                      <div
                        key={edit.id}
                        onBlur={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) stopEditing()
                        }}
                        className="flex shrink-0 items-center gap-1"
                      >
                        <Input
                          autoFocus
                          aria-label={`New ${edit.id} for ${label}`}
                          inputMode="numeric"
                          value={value}
                          onChange={(event) => setValue(event.target.value.replace(edit.allowUnlimited ? /[^0-9-]/g : /[^0-9]/g, ''))}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && valid) save()
                            if (event.key === 'Escape') stopEditing()
                          }}
                          className="h-7 w-14 px-1 text-center font-mono text-xs"
                        />
                        <button
                          type="button"
                          aria-label={`Save ${edit.id} for ${label}`}
                          disabled={!valid}
                          onClick={save}
                          className="flex h-7 w-7 items-center justify-center border border-emerald-400 bg-emerald-500 text-black disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        key={edit.id}
                        type="button"
                        title={`Edit ${edit.id}`}
                        onClick={() => {
                          setEditing(fieldKey)
                          setValue(String(edit.value))
                        }}
                        className="shrink-0 border border-emerald-700 px-2 py-1 font-mono text-xs text-emerald-400"
                      >
                        {edit.label}
                      </button>
                    )
                  })}
                <button
                  type="button"
                  aria-label={armed ? `Really remove ${label}` : `Remove ${label}`}
                  title={armed ? 'Click again to remove' : 'Remove'}
                  disabled={entry.disabled}
                  onClick={() => {
                    if (!armed) {
                      setRemovalArmed(entry.key)
                      stopEditing()
                      return
                    }
                    setRemovalArmed(null)
                    void perform(entry.onRemove)
                  }}
                  className={`flex h-7 shrink-0 items-center justify-center gap-1 border px-1.5 disabled:opacity-40 ${armed ? 'border-rose-300 bg-rose-600 text-white' : 'border-rose-800 text-rose-400'}`}
                >
                  {armed && <span className="text-[10px] font-semibold">Really?</span>}
                  <X className="h-4 w-4" />
                </button>
                {entry.retry && (
                  <button type="button" onClick={() => void perform(entry.retry!)} className="h-7 shrink-0 border border-orange-700 px-2 text-xs text-orange-400">
                    Retry
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
