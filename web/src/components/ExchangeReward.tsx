import { useState } from 'react'
import { useDynamicState, usePartyApi, useRefreshDynamicStateNow, useConfigLoaded } from '@/data/PartyDataProvider'
import { itemActionBanner } from '@/lib/itemActionBanner'
import { itemMaximumLevel, upgradeRuleTiers } from '@/lib/itemFormulas'
import { automaticCommerceRuleKey, type Item, type Sprite } from '@/models'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { SpriteIcon } from '@/components/SpriteIcon'
import { StandListingForm } from '@/components/StandListingForm'
import { AutoNpcSaleConfirmation } from '@/components/ItemConfirmations'
import { AddUpgradeRule } from '@/components/Offerings'
import { TapRow, UpgradeTierPicker, CompoundTierPicker } from '@/screens/itempanel/ItemActionPanel'
import type { ApiResult, CommandResult } from '@/api/partyApi'

/** exchange-mark-controls.tsx ExchangeMarkMode. */
export type ExchangeMarkMode = { action: 'bank' | 'stand' | 'npc' | 'upgrade'; targetLevel?: number }

/** exchange-mark-controls.tsx, verbatim labels and gating. */
export function ExchangeMarkControls({ enabled, mode, saving, onMode }: { enabled: boolean; mode: ExchangeMarkMode | null; saving: boolean; onMode: (mode: ExchangeMarkMode) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(['bank', 'stand', 'upgrade', 'npc'] as const).map((action) => (
        <Button
          key={action}
          size="sm"
          variant="outline"
          disabled={!enabled || saving}
          aria-pressed={mode?.action === action}
          onClick={() => onMode({ action, ...(action === 'upgrade' ? { targetLevel: mode?.targetLevel || 1 } : {}) })}
          className={
            !enabled || (mode && mode.action !== action)
              ? 'border-slate-700 text-slate-500'
              : action === 'bank'
                ? 'border-yellow-400'
                : action === 'stand'
                  ? 'border-sky-400'
                  : action === 'upgrade'
                    ? 'border-violet-400'
                    : 'border-rose-400'
          }
        >
          {action === 'npc' ? 'NPC' : action[0].toUpperCase() + action.slice(1)}
        </Button>
      ))}
      {enabled && mode?.action === 'upgrade' && (
        <label className="flex items-center gap-2 text-xs text-violet-100">
          Target level
          <select
            aria-label="Bulk upgrade target level"
            value={mode.targetLevel}
            onChange={(event) => onMode({ action: 'upgrade', targetLevel: Number(event.target.value) })}
            className="rounded border border-violet-400 bg-background p-2"
          >
            {Array.from({ length: 13 }, (_, index) => index + 1).map((level) => (
              <option key={level} value={level}>
                +{level}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

/** exchange-reward-tile.tsx ExchangeRewardTileData. */
export interface ExchangeRewardTileData {
  id: string
  level: number
  name: string
  quantity: number
  sprite?: Sprite | null
  detail: string
  onInspect: () => void
  kind?: string
  marking?: boolean
  markMode?: ExchangeMarkMode | null
  stagedMode?: ExchangeMarkMode
  saving?: boolean
  onStage?: (reward: ExchangeRewardTileData, mode: ExchangeMarkMode) => void
}

const PASSIVE_KINDS = ['empty', 'gold', 'shells', 'cx', 'cxbundle', 'open']

/** exchange-reward-tile.tsx: a prospective reward with its automatic-rule
 *  banner. Tapping opens its options list (Item details first, then the
 *  automatic actions the dashboard puts in the tile's context menu); while
 *  marking multiple, tapping stages the chosen bulk rule instead. */
export function ExchangeRewardTile({ reward }: { reward: ExchangeRewardTileData }) {
  const state = useDynamicState()
  const merchant = state.merchantCharacter
  const [options, setOptions] = useState(false)
  const passive = !!reward.kind && PASSIVE_KINDS.includes(reward.kind)
  const name = reward.kind === 'empty' ? 'No reward' : reward.name
  const sprite =
    reward.kind === 'gold' || reward.kind === 'empty'
      ? { url: `/images/exchange/${reward.kind === 'gold' ? 'gold-coins' : 'no-reward'}.png`, tileSize: 1, columns: 1, rows: 1, x: 0, y: 0 }
      : reward.sprite
  const item: Item = { name: reward.id, level: reward.level }
  const meta = state.merchantCatalog?.allItems?.find((candidate) => candidate.id === reward.id)?.meta ?? undefined
  const key = `${item.name}@+${item.level}`
  const commerce = automaticCommerceRuleKey(item)
  const bank = state.autoItemMarks?.[String(merchant)]?.[key] || (!item.level ? state.autoItemMarks?.[String(merchant)]?.[item.name] : undefined)
  const upgradeRule = state.autoUpgradeMarks?.[String(merchant)]?.[key]
  const upgradeTiers = upgradeRuleTiers(upgradeRule)
  // upgrade-rule-quantity.tsx: -1 unless the rule carries a safe-integer quantity.
  const upgradeQuantity = typeof upgradeRule === 'object' && upgradeRule && Number.isSafeInteger(Number((upgradeRule as { quantity?: unknown }).quantity)) ? Number((upgradeRule as { quantity?: unknown }).quantity) : -1
  const upgradePending = !!upgradeTiers && upgradeQuantity !== 0
  const compound = state.autoCompounds?.[String(merchant)]?.find((rule) => rule.name === item.name)
  const npc = !!state.autoNpcSales?.[commerce]
  const stand = !!state.autoStandMarks?.[commerce]
  const exchange = !!state.autoExchanges?.[`${item.name}@${item.level}`]
  const bulkUnsupported =
    reward.markMode?.action === 'upgrade' && (!meta?.upgradeable || Number(reward.markMode.targetLevel) <= (item.level || 0) || Number(reward.markMode.targetLevel) > itemMaximumLevel(meta))
  function clicked() {
    if (!reward.marking) return setOptions(true)
    if (reward.markMode && merchant && !passive && !bulkUnsupported) reward.onStage?.(reward, reward.markMode)
  }
  const staged = reward.stagedMode
  const stagedBanner = staged && {
    action: staged.action,
    automatic: true,
    label: staged.action === 'bank' ? 'Auto bank' : staged.action === 'stand' ? 'Auto stand' : staged.action === 'npc' ? 'Auto sell to NPC' : `Auto upgrade → +${staged.targetLevel}`,
  }
  const banner = itemActionBanner(
    stagedBanner
      ? [stagedBanner]
      : [
          exchange && { action: 'exchange', automatic: true, label: 'Auto exchange' },
          npc && { action: 'npc', automatic: true, label: 'Auto sell to NPC' },
          stand && { action: 'stand', automatic: true, label: 'Auto stand' },
          upgradePending && { action: 'upgrade', automatic: true, label: `Auto upgrade → +${(item.level || 0) + upgradeTiers}` },
          !!compound && compound.quantity !== 0 && (item.level || 0) < compound.targetTier && { action: 'compound', automatic: true, label: `Auto compound → +${compound.targetTier}` },
          !!state.autoDeconstruction?.[String(merchant)]?.[commerce] && { action: 'deconstruction', automatic: true, label: 'Auto deconstruction' },
          { action: 'bank', label: bank === 'bank' ? 'Auto bank' : 'Auto bank (default)' },
        ],
    true,
  )!
  const disabled = passive || reward.saving || (!!reward.marking && (!reward.markMode || bulkUnsupported))
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label={`Exchange reward: ${reward.id} +${reward.level}`}
        onClick={clicked}
        title={`${name}${reward.level ? ` +${reward.level}` : ''}${passive ? '' : ` · ${banner.label}`}`}
        className="flex h-full w-28 flex-col items-center gap-1 rounded border border-border bg-card p-2 text-center disabled:cursor-default disabled:opacity-60"
      >
        <span className={`relative h-14 w-14 shrink-0 overflow-hidden rounded border bg-black p-1 ${passive ? 'border-slate-600' : banner.border}`}>
          <SpriteIcon sprite={sprite} size={46} className="bg-transparent" />
          {!passive && <span className={`absolute inset-x-0 top-0 z-10 px-0.5 text-center text-[9px] leading-tight ${banner.colors}`}>{banner.label}</span>}
          {reward.quantity > 1 && <span className="absolute bottom-0 right-0 bg-black px-0.5 text-[9px] text-white">×{reward.quantity.toLocaleString()}</span>}
        </span>
        {reward.marking && <span className="h-3 text-[9px] leading-tight text-sky-300">{staged ? 'Pending' : ''}</span>}
        <span className="font-mono text-[10px] leading-tight text-amber-300">{reward.detail}</span>
        <span className="w-full whitespace-normal break-words text-xs leading-tight">
          {name}
          {reward.level ? ` +${reward.level}` : ''}
        </span>
      </button>
      {options && (
        <Sheet open onOpenChange={(open) => !open && setOptions(false)}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
            <div className="pb-1 pt-1 text-sm text-muted-foreground">
              {name}
              {reward.level ? ` +${reward.level}` : ''}
            </div>
            <div className="my-2 border-t border-border" />
            <TapRow
              label="Item details"
              onClick={() => {
                setOptions(false)
                reward.onInspect()
              }}
            />
            {merchant && !passive && (
              <AutomaticItemActions
                merchant={merchant}
                item={item}
                meta={meta}
                bank={bank === 'bank'}
                npc={npc}
                stand={stand}
                exchange={exchange}
                exchangeable={!!state.merchantCatalog?.exchangeable?.some((choice) => !choice.reward && choice.id === item.name && choice.level === item.level)}
                upgradeTiers={upgradeTiers}
                compoundTier={compound?.targetTier}
                onDone={() => setOptions(false)}
              />
            )}
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}

/** automatic-item-actions.tsx for a prospective reward (slot -1), as this
 *  app's options rows with inline sub-lists and confirmations. */
function AutomaticItemActions({
  merchant,
  item,
  meta,
  bank,
  stand,
  npc,
  exchange,
  exchangeable,
  upgradeTiers,
  compoundTier,
  onDone,
}: {
  merchant: string
  item: Item
  meta: Parameters<typeof itemMaximumLevel>[0]
  bank: boolean
  stand: boolean
  npc: boolean
  exchange: boolean
  exchangeable: boolean
  upgradeTiers: number
  compoundTier?: number
  onDone: () => void
}) {
  const api = usePartyApi()
  const state = useDynamicState()
  const refreshNow = useRefreshDynamicStateNow()
  const configLoaded = useConfigLoaded()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toggle = (key: string) => setExpanded(expanded === key ? null : key)
  const level = Number(item.level) || 0
  const compoundMax = Math.min(7, itemMaximumLevel(meta))
  const settle = async (result: ApiResult<CommandResult>) => {
    if (result.kind === 'failure') return result.message
    await refreshNow()
    onDone()
    return null
  }
  const command = async (type: string, extra: Record<string, unknown>) => {
    const message = await settle(await api.itemCommand(type, merchant, item, undefined, extra))
    setError(message)
  }
  const commerce = automaticCommerceRuleKey(item)
  return (
    <div>
      {error && <p role="alert" className="py-1 text-sm text-destructive">{error}</p>}
      <TapRow label="Auto mark for bank" disabled={bank} onClick={() => void command('auto-item-mark', { mode: 'bank' })} />
      <TapRow label={stand ? 'Update auto mark for stand…' : 'Auto mark for stand…'} onClick={() => toggle('stand')} />
      {expanded === 'stand' && (
        <StandListingForm
          auto
          item={item}
          meta={meta}
          existing={{ price: (state.autoStandMarks[commerce] as { price?: number } | undefined)?.price || Math.max(1, Number(meta?.definition.g) || 1) }}
          onCancel={() => setExpanded(null)}
          onSubmit={async ({ price }) => settle(await api.autoStand(item, price))}
        />
      )}
      {exchangeable && <TapRow label="Auto exchange" disabled={!configLoaded || exchange} onClick={() => void command('auto-exchange', { slot: -1 })} />}
      {meta?.upgradeable && itemMaximumLevel(meta) - level > 0 && (
        <>
          <TapRow label={`Auto mark for upgrade${upgradeTiers ? ` · ${upgradeTiers} tier${upgradeTiers === 1 ? '' : 's'}` : ''}`} onClick={() => toggle('upgrade')} />
          {expanded === 'upgrade' && (
            <>
              <UpgradeTierPicker meta={meta} level={level} current={upgradeTiers} onPick={(tiers) => void command('auto-upgrade-mark', { slot: -1, tiers })} />
              {/* party-merchant-commerce-dialog.tsx wraps rewards in the merchant's UpgradeOfferingProvider. */}
              <AddUpgradeRule character={merchant} item={item} meta={meta} />
            </>
          )}
        </>
      )}
      {meta?.compoundable && level < compoundMax && (
        <>
          <TapRow label={compoundTier ? `Auto compound to +${compoundTier}` : 'Auto compound'} onClick={() => toggle('compound')} />
          {expanded === 'compound' && <CompoundTierPicker meta={meta} level={level} buyable={state.merchantCatalog?.buyable ?? []} onPick={(targetTier) => void command('auto-compound-mark', { targetTier })} />}
        </>
      )}
      <TapRow label={npc ? 'Update auto sell to NPC…' : 'Auto sell to NPC…'} onClick={() => toggle('npc')} />
      {expanded === 'npc' && (
        <AutoNpcSaleConfirmation
          item={item}
          meta={meta}
          name={String(meta?.definition.name || item.name)}
          onCancel={() => setExpanded(null)}
          onConfirm={async () => settle(await api.autoNpcSale(undefined, item))}
        />
      )}
    </div>
  )
}
