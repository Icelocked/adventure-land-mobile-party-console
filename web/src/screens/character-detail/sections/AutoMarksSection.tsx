import { useState } from 'react'
import { X } from 'lucide-react'
import { usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { displayName } from '@/lib/catalogLookup'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Button } from '@/components/ui/button'
import { ExpandChevron } from '@/components/ExpandChevron'
import { SectionCard } from '../SectionCard'
import type { CatalogItem, Item, PartyStateDynamic } from '@/models'
import { itemFromRuleKey } from '@/models'

interface RuleEntry {
  key: string
  item: Item
  detail?: string | null
  // A running mark can't be removed; a blocked one can be retried (inventory-panel.tsx).
  disabled?: boolean
  onRetry?: () => Promise<unknown>
  onRemove: () => Promise<unknown>
}

/** Ports inventory-panel.tsx's seven "automaticSection(...)" blocks (via
 *  ui/characterdetail/sections/AutoMarksSection.kt) - not just setting a
 *  rule (the item action panel), but seeing and removing every standing
 *  rule. "Upgrade rules" (a separate offer-negotiation feature) is
 *  deliberately not ported, same as the Android app. */
export function AutoMarksSection({
  characterName,
  isMerchant,
  dynamicState,
  catalogFor,
}: {
  characterName: string
  isMerchant: boolean
  dynamicState: PartyStateDynamic
  catalogFor: (id: string) => CatalogItem | undefined
}) {
  const api = usePartyApi()

  // shared-rules.ts ruleOwner: with shared merchant rules, every member's
  // rules live under the merchant (connected-inventory.tsx reads them there).
  const owner = dynamicState.merchantRules ? (dynamicState.merchantCharacter ?? characterName) : characterName
  // connected-inventory.tsx: the configured merchant's NPC rules are the
  // account-wide ones (no `character`); the server also drops `character`
  // in shared mode (automatic-sales.ts). Everyone else's are per-player.
  const npcScope = characterName === dynamicState.merchantCharacter || dynamicState.merchantRules ? undefined : characterName
  const npcEntries: RuleEntry[] = Object.entries(dynamicState.autoNpcSales)
    .filter(([, rule]) => (npcScope === undefined ? rule.character == null : rule.character === characterName))
    .map(([key, rule]): RuleEntry => ({ key, item: rule.item, onRemove: () => api.autoNpcSale(npcScope, rule.item, true) }))
    // inventory-panel.tsx: plus every manual NPC-sale mark, by id.
    .concat(
      isMerchant
        ? dynamicState.npcSaleMarks.map((mark) => ({
            key: mark.id,
            item: mark.item,
            detail: `${mark.character || dynamicState.merchantCharacter} · ${mark.quantity} × · ${mark.state || 'queued'}${mark.error ? ` · ${mark.error}` : ''}`,
            disabled: mark.state === 'running',
            onRemove: () => api.removeNpcSaleMark(mark.character || characterName, mark.id),
          }))
        : [],
    )
  const clearNpc = () => api.clearAllAutoNpcSales(npcScope)

  const deconEntries: RuleEntry[] = Object.entries(dynamicState.autoDeconstruction[owner] ?? {}).map(([key, rule]) => ({
    key,
    item: rule.item,
    detail: 'Automatic',
    onRemove: () => api.autoDeconstruct(characterName, rule.item, true),
  }))
  // inventory-panel.tsx: plus every pending deconstruction mark.
  const deconMarks: RuleEntry[] = isMerchant
    ? dynamicState.deconstructionMarks
        .filter((mark) => mark.state !== 'complete')
        .map((mark) => ({
          key: mark.id,
          item: mark.item,
          detail: `${mark.owner} · ${mark.quantity} × · ${mark.state}${mark.error ? ` · ${mark.error}` : ''}`,
          disabled: mark.state === 'running',
          onRetry: mark.state === 'blocked' ? () => api.retryDeconstructionMark(mark.owner || characterName, mark.id) : undefined,
          onRemove: () => api.removeDeconstructionMark(mark.owner || characterName, mark.id, mark.slot, mark.item),
        }))
    : []
  // No bulk route for deconstruction (mark-commands.ts has one for bank/merchant marks, compound-
  // commands.ts for upgrades/compounds, automatic-sales.ts for npc/stand - deconstruction doesn't) -
  // inventory-panel.tsx's own clearAutomaticSection loops the existing per-rule remove the same way.
  const clearDecon = () => Promise.all(deconEntries.map((entry) => entry.onRemove()))

  const bankEntries: RuleEntry[] = Object.entries(dynamicState.autoItemMarks[owner] ?? {})
    .filter(([, mode]) => mode === 'bank')
    .map(([key]) => ({ key, item: itemFromRuleKey(key), onRemove: () => api.removeAutoItemMark(characterName, 'bank', key) }))
  const clearBank = () => api.clearAutoItemMarks(characterName, 'bank')

  let standEntries: RuleEntry[] = []
  let upgradeEntries: RuleEntry[] = []
  let compoundEntries: RuleEntry[] = []
  let merchantMarkEntries: RuleEntry[] = []

  if (isMerchant) {
    standEntries = Object.entries(dynamicState.autoStandMarks).map(([key, rule]) => ({
      key,
      item: rule.item,
      detail: `${rule.price}g`,
      onRemove: () => api.autoStand(rule.item, rule.price, true),
    }))

    upgradeEntries = Object.entries(dynamicState.autoUpgradeMarks).flatMap(([owner, rules]) =>
      Object.keys(rules).map((ruleKey) => {
        const item = itemFromRuleKey(ruleKey)
        return {
          key: `${owner}:${ruleKey}`,
          item,
          detail: owner !== characterName ? owner : null,
          onRemove: () => api.removeAutoUpgradeRule(owner, item, ruleKey),
        }
      }),
    )

    compoundEntries = Object.entries(dynamicState.autoCompounds).flatMap(([owner, rules]) =>
      rules.map((rule) => ({
        key: `${owner}:${rule.name}`,
        item: { name: rule.name },
        detail: `target +${rule.targetTier}${owner !== characterName ? ` · ${owner}` : ''}`,
        onRemove: () => api.removeAutoCompound(owner, rule.name, rule.targetTier),
      })),
    )

    merchantMarkEntries = Object.entries(dynamicState.autoItemMarks[owner] ?? {})
      .filter(([, mode]) => mode === 'merchant')
      .map(([key]) => ({ key, item: itemFromRuleKey(key), onRemove: () => api.removeAutoItemMark(characterName, 'merchant', key) }))
  }
  const clearStand = () => api.clearAllAutoStand()
  const clearUpgrades = () => api.clearAutoUpgrades(characterName)
  const clearCompounds = () => api.clearAutoCompounds(characterName)
  const clearMerchantMarks = () => api.clearAutoItemMarks(characterName, 'merchant')

  return (
    <SectionCard title="Automatic rules">
      <AutoRuleGroup title="Auto NPC sales" entries={npcEntries} catalogFor={catalogFor} onClearAll={clearNpc} />
      <AutoRuleGroup title="Auto deconstruction" entries={[...deconEntries, ...deconMarks]} catalogFor={catalogFor} onClearAll={clearDecon} />
      {isMerchant && (
        <>
          <AutoRuleGroup title="Auto stand marks" entries={standEntries} catalogFor={catalogFor} onClearAll={clearStand} />
          <AutoRuleGroup title="Auto upgrades" entries={upgradeEntries} catalogFor={catalogFor} onClearAll={clearUpgrades} />
          <AutoRuleGroup title="Auto compounds" entries={compoundEntries} catalogFor={catalogFor} onClearAll={clearCompounds} />
          <AutoRuleGroup title="Auto merchant marks" entries={merchantMarkEntries} catalogFor={catalogFor} onClearAll={clearMerchantMarks} />
        </>
      )}
      <AutoRuleGroup title="Auto bank marks" entries={bankEntries} catalogFor={catalogFor} onClearAll={clearBank} />
    </SectionCard>
  )
}

function AutoRuleGroup({
  title,
  entries,
  catalogFor,
  onClearAll,
}: {
  title: string
  entries: RuleEntry[]
  catalogFor: (id: string) => CatalogItem | undefined
  onClearAll: () => Promise<unknown>
}) {
  const [expanded, setExpanded] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const refreshNow = useRefreshDynamicStateNow()

  return (
    <div className="py-1">
      <button className="flex w-full items-center gap-1.5 text-left text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setExpanded((v) => !v)}>
        <span className="min-w-0 flex-1">{title} ({entries.length})</span>
        <ExpandChevron expanded={expanded} />
      </button>
      {expanded && (
        <div className="mt-1 flex flex-col gap-0.5 pl-4">
          {entries.map((entry) => (
            <div key={entry.key} className="flex items-center gap-2">
              <SpriteIcon sprite={catalogFor(entry.item.name)?.sprite} size={24} />
              <span className="min-w-0 flex-1 text-sm">
                {displayName(entry.item.name, catalogFor)}
                {entry.item.level != null ? ` +${entry.item.level}` : ''}
                {entry.detail ? ` · ${entry.detail}` : ''}
              </span>
              {entry.onRetry && (
                <Button
                  variant="link"
                  size="xs"
                  onClick={async () => {
                    await entry.onRetry!()
                    await refreshNow()
                  }}
                >
                  Retry
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Remove"
                disabled={entry.disabled}
                onClick={async () => {
                  await entry.onRemove()
                  await refreshNow()
                }}
              >
                <X className="size-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
          {entries.length > 0 &&
            (confirmingClear ? (
              <div className="mt-1 flex items-center gap-2">
                <span className="flex-1 text-xs text-destructive">Really clear all?</span>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={async () => {
                    setConfirmingClear(false)
                    await onClearAll()
                    await refreshNow()
                  }}
                >
                  Clear all
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmingClear(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="link" size="xs" className="mt-1 justify-start text-destructive" onClick={() => setConfirmingClear(true)}>
                Clear all
              </Button>
            ))}
        </div>
      )}
    </div>
  )
}
