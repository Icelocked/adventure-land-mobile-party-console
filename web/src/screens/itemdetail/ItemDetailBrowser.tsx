import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, DollarSign, HandCoins, SlidersHorizontal } from 'lucide-react'
import { useCharacterDiagnosticsMap, useCharacters, useDynamicState } from '@/data/PartyDataProvider'
import { WtbDialog } from '@/components/Wtb'
import { standIsFull } from '@/lib/standInspection'
import { GearComparisonSheet } from '@/screens/itempanel/GearComparisonSheet'
import { SpriteIcon } from '@/components/SpriteIcon'
import { TracktrixBonusList } from '@/components/Tracktrix'
import { MonsterDetail } from '@/components/MonsterDetail'
import { ExchangeRewardTile } from '@/components/ExchangeReward'
import { Chip } from '@/components/Chip'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  buildStatRows,
  comparisonSlotLabel,
  comparisonSlotsFor,
  definitionNumber,
  detailMeta,
  propertiesAtLevel,
  isEquipment,
  definitionString,
  effectiveDropRate,
  exchangeSections,
  exchangeTarget,
  formatDropRate,
  formatStatValue,
  itemMaximumLevel,
  npcSaleValue,
  rewardPercentage,
  type ExchangeSections,
} from '@/lib/itemFormulas'
import { cn } from '@/lib/utils'
import type {
  BestiaryMonster,
  CatalogItem,
  ItemCraftUse,
  ItemMeta,
  ItemRecipe,
  ItemSetInfo,
  ItemDropSource,
  MerchantCatalog,
  Sprite,
} from '@/models'

/** Mobile take on party-console's "left-click an item" details dialog
 *  (item-details.tsx) - ported from ui/itemdetail/ItemDetailBrowser.kt,
 *  same underlying data (ItemMeta via the merchant catalog), redesigned
 *  as a header + a row of chips for only the sections that apply to THIS
 *  item. Tapping a related item/material/set-piece/exchange result or a
 *  drop's monster drills into ITS details with a back button. */
type DetailTarget = { kind: 'item'; id: string; level: number } | { kind: 'monster'; id: string }

export function ItemDetailBrowser({
  rootItemId,
  rootLevel,
  catalog,
  monsters,
  rootStatType,
  rootGift = false,
  rootExpires,
  rootMeta,
  context,
  onAddStand,
  exchangeAdd,
  className,
}: {
  rootItemId: string
  rootLevel: number
  catalog: MerchantCatalog | null | undefined
  monsters: BestiaryMonster[]
  rootStatType?: string
  rootGift?: boolean
  rootExpires?: unknown
  // The live instance's meta, merged over the catalog's (use-party-console.tsx detailMeta).
  rootMeta?: ItemMeta | null
  // item-details.tsx header: whose item and where ("Ranger1 · slot 3").
  context?: { character: string; slot: number }
  // item-details.tsx "Add to stand": only for the merchant's inventory or the bank.
  onAddStand?: () => void
  // item-details.tsx: the exchange catalog's "Add" for the inspected exchange.
  exchangeAdd?: { enabled: boolean; onAdd: () => void }
  className?: string
}) {
  const [trail, setTrail] = useState<DetailTarget[]>([{ kind: 'item', id: rootItemId, level: rootLevel }])
  const current = trail[trail.length - 1]

  const pushItem = (id: string, level: number) => setTrail((t) => [...t, { kind: 'item', id, level }])
  const pushMonster = (id: string) => setTrail((t) => [...t, { kind: 'monster', id }])

  return (
    <div className={className}>
      {trail.length > 1 && (
        <Button variant="link" size="xs" className="mb-1 gap-1 px-0 text-muted-foreground" onClick={() => setTrail((t) => t.slice(0, -1))}>
          <ArrowLeft className="size-4" /> Back
        </Button>
      )}
      {current.kind === 'item' ? (
        <ItemDetailContent
          target={current}
          catalog={catalog}
          isRoot={current.id === rootItemId && current.level === rootLevel && trail.length === 1}
          rootStatType={rootStatType}
          rootGift={rootGift}
          rootExpires={rootExpires}
          rootMeta={rootMeta}
          context={trail.length === 1 ? context : undefined}
          onAddStand={trail.length === 1 ? onAddStand : undefined}
          onNavigateItem={pushItem}
          onNavigateMonster={pushMonster}
        />
      ) : (
        (() => {
          const monster = monsters.find((m) => m.id === current.id)
          return monster ? <MonsterDetail monster={monster} onInspectDrop={(id) => pushItem(id, 0)} /> : <p className="py-4 text-sm text-muted-foreground">No bestiary data for this monster yet.</p>
        })()
      )}
      {exchangeAdd && trail.length === 1 && (
        <Button className="mt-3 w-full border border-emerald-500" disabled={!exchangeAdd.enabled} onClick={exchangeAdd.onAdd}>
          Add
        </Button>
      )}
    </div>
  )
}

const TABS = ['Overview', 'Set bonus', 'Craftable', 'Ingredient in', 'Exchange', 'Drops'] as const
type Tab = (typeof TABS)[number]

function ItemDetailContent({
  target,
  catalog,
  isRoot,
  rootStatType,
  rootGift,
  rootExpires,
  rootMeta,
  context,
  onAddStand,
  onNavigateItem,
  onNavigateMonster,
}: {
  rootMeta?: ItemMeta | null
  context?: { character: string; slot: number }
  onAddStand?: () => void
  target: { id: string; level: number }
  catalog: MerchantCatalog | null | undefined
  isRoot: boolean
  rootStatType?: string
  rootGift: boolean
  rootExpires: unknown
  onNavigateItem: (id: string, level: number) => void
  onNavigateMonster: (id: string) => void
}) {
  const catalogItem = useMemo(() => catalog?.allItems.find((item) => item.id === target.id), [catalog, target.id])
  const [previewLevel, setPreviewLevel] = useState(target.level)
  // This component isn't remounted when navigating to a related item (tapping
  // a craft material, set-bonus piece, exchange result, etc. - onNavigateItem
  // just changes `target` in place) - without this reset, previewLevel keeps
  // whatever value it had for the PREVIOUS item, feeding a wrong stat preview
  // and NPC sale price into the newly-navigated item. Matches the Kotlin
  // app's `remember(target.id, target.level)` for the same state.
  useEffect(() => {
    setPreviewLevel(target.level)
  }, [target.id, target.level])

  // item-details.tsx: the exchange sections follow the preview-level slider.
  const exchanges = useMemo(() => exchangeSections(target.id, previewLevel, catalog?.exchangeable ?? []), [catalog, target.id, previewLevel])

  const meta = isRoot ? detailMeta(catalogItem?.meta, rootMeta) : (catalogItem?.meta ?? undefined)
  const world = meta?.world
  const state = useDynamicState()
  const characters = useCharacters()
  const diagnostics = useCharacterDiagnosticsMap()
  const [addingWtb, setAddingWtb] = useState(false)
  const [comparePicker, setComparePicker] = useState<string | null | false>(false)
  const [comparing, setComparing] = useState<{ character: string; slot?: string } | null>(null)
  const navigate = useNavigate()
  // stand-capacity.tsx standIsFull.
  const standFull = standIsFull(state.standListings, state.standBids)
  const partyNames = Object.keys(characters).filter((name) => characters[name]?.vitals)
  const comparable = isEquipment(meta?.definition)
  const tracktrix = context && ['tracker', 'supercomputer'].includes(target.id) ? (diagnostics[context.character]?.tracktrix as { active?: boolean; bonuses?: Record<string, number> | null } | undefined) : undefined
  const explanation = typeof meta?.definition.explanation === 'string' ? meta.definition.explanation : undefined

  const tabs = useMemo(() => {
    const list: Tab[] = ['Overview']
    if (world?.set) list.push('Set bonus')
    if (world?.recipe) list.push('Craftable')
    if (world?.usedIn?.length) list.push('Ingredient in')
    if (exchanges.prices.length || exchanges.rewards.length || exchanges.sources.length) list.push('Exchange')
    if (world?.drops?.length) list.push('Drops')
    return list
  }, [world, exchanges])

  const [selectedTab, setSelectedTab] = useState<Tab>('Overview')
  const activeTab = tabs.includes(selectedTab) ? selectedTab : tabs[0]

  if (!catalogItem) {
    return <p className="py-4 text-sm text-muted-foreground">No catalog data for "{target.id}" yet.</p>
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2.5 pt-1">
        <SpriteIcon sprite={catalogItem.sprite} size={48} />
        <span className="text-base font-semibold">
          {catalogItem.name}
          {target.level > 0 ? ` +${target.level}` : ''}
        </span>
      </div>
      {context && (
        <p className="-mt-1 mb-2 text-xs text-muted-foreground">
          {context.character} · slot {context.slot}
        </p>
      )}
      <div className="mb-2 flex flex-wrap gap-2">
        {onAddStand && context && context.slot >= 0 && (
          <Button size="sm" variant="outline" disabled={standFull} onClick={onAddStand}>
            <DollarSign className="size-4" /> Add to stand
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setAddingWtb(true)}>
          <HandCoins className="size-4" /> Add to WTB
        </Button>
      </div>
      {context && ['tracker', 'supercomputer'].includes(target.id) && characters[context.character] && <TracktrixBonusList data={tracktrix} />}
      {explanation && <p className="mb-2 text-sm text-muted-foreground">{explanation}</p>}

      {tabs.length > 1 && (
        <div className="mb-2.5 flex gap-1.5 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <Chip key={tab} selected={tab === activeTab} onClick={() => setSelectedTab(tab)}>
              {tab}
            </Chip>
          ))}
        </div>
      )}

      {activeTab === 'Overview' && comparable && (meta?.upgradeable || meta?.compoundable) && (
        <div className="mb-2">
          <Button size="sm" variant="outline" onClick={() => setComparePicker(comparePicker === false ? null : false)}>
            <SlidersHorizontal className="size-4" /> Compare
          </Button>
          {comparePicker !== false && (
            <div role="group" aria-label="Compare for" className="mt-1.5 flex flex-col gap-1 rounded-md border border-cyan-800 p-2">
              {comparePicker === null ? (
                <>
                  <p className="font-mono text-[10px] uppercase text-cyan-400">Compare +{previewLevel} for</p>
                  {partyNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        const slots = comparisonSlotsFor(meta, characters[name]?.vitals?.ctype ?? '')
                        if (slots.length > 1) return setComparePicker(name)
                        setComparePicker(false)
                        setComparing({ character: name, slot: slots[0] })
                      }}
                      className="flex items-center justify-between rounded border border-border px-3 py-2 text-left text-xs"
                    >
                      <span>{name}</span>
                      <span className="font-mono text-[10px] uppercase text-muted-foreground">{characters[name]?.vitals?.ctype}</span>
                    </button>
                  ))}
                  {/* item-details.tsx "From catalog": this item at the preview level becomes A. */}
                  <button
                    type="button"
                    onClick={() => {
                      setComparePicker(false)
                      const item = { name: target.id, level: previewLevel, ...(isRoot && rootStatType ? { stat_type: rootStatType } : {}) }
                      navigate('/catalog', {
                        state: { comparison: { slot: context?.slot ?? -1, item, meta: meta ? { ...meta, properties: propertiesAtLevel(meta, item, previewLevel, item.stat_type) } : meta } },
                      })
                    }}
                    className="mt-1 rounded border border-cyan-700 px-3 py-2 text-left text-sm text-cyan-100"
                  >
                    From catalog
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setComparePicker(null)} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowLeft className="size-3.5" /> {comparePicker} · Choose equipment slot
                  </button>
                  {comparisonSlotsFor(meta, characters[comparePicker]?.vitals?.ctype ?? '').map((slot) => {
                    const equipped = characters[comparePicker]?.inventory?.slots?.[slot]
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => {
                          setComparing({ character: comparePicker, slot })
                          setComparePicker(false)
                        }}
                        className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2 text-left text-xs"
                      >
                        <span>{comparisonSlotLabel(slot)}</span>
                        <span className="truncate font-mono text-[10px] text-muted-foreground">{equipped ? String(equipped.meta?.definition.name || catalog?.allItems.find((entry) => entry.id === equipped.item.name)?.name || equipped.item.name) : 'Empty'}</span>
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          )}
        </div>
      )}
      {activeTab === 'Overview' && (
        <OverviewSection
          meta={meta}
          actualLevel={target.level}
          previewLevel={previewLevel}
          onPreviewLevelChange={setPreviewLevel}
          statType={isRoot ? rootStatType : undefined}
          gift={isRoot ? rootGift : false}
          expires={isRoot ? rootExpires : undefined}
        />
      )}
      {activeTab === 'Set bonus' && world?.set && <SetBonusSection set={world.set} currentId={target.id} onNavigateItem={onNavigateItem} />}
      {activeTab === 'Craftable' && world?.recipe && <CraftableSection recipe={world.recipe} onNavigateItem={onNavigateItem} />}
      {activeTab === 'Ingredient in' && world?.usedIn && <IngredientInSection usedIn={world.usedIn} onNavigateItem={onNavigateItem} />}
      {activeTab === 'Exchange' && (
        <ExchangeSection id={target.id} box={meta?.definition.type === 'box' || /box/i.test(target.id)} exchanges={exchanges} onNavigateItem={onNavigateItem} />
      )}
      {activeTab === 'Drops' && world?.drops && <DropsSection drops={world.drops} onNavigateMonster={onNavigateMonster} />}
      {addingWtb && (
        <WtbDialog
          item={{ name: target.id, level: previewLevel }}
          meta={meta}
          catalogFor={(id) => catalog?.allItems.find((entry) => entry.id === id)}
          buyable={catalog?.buyable ?? []}
          history={state.standPriceHistory?.[target.id]}
          existing={state.standBids[target.id]}
          onClose={() => setAddingWtb(false)}
        />
      )}
      {comparing && (
        <GearComparisonSheet
          item={{ name: target.id, level: previewLevel, ...(isRoot && rootStatType ? { stat_type: rootStatType } : {}) }}
          meta={meta}
          characterName={comparing.character}
          slot={comparing.slot}
          onClose={() => setComparing(null)}
        />
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: string }) {
  return <div className="mb-1 mt-1.5 text-xs font-medium text-primary">{children}</div>
}

function PriceCard({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('rounded-md border border-border bg-background p-2.5', className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  )
}

function OverviewSection({
  meta,
  actualLevel,
  previewLevel,
  onPreviewLevelChange,
  statType,
  gift,
  expires,
}: {
  meta: ItemMeta | undefined
  actualLevel: number
  previewLevel: number
  onPreviewLevelChange: (level: number) => void
  statType?: string
  gift: boolean
  expires: unknown
}) {
  const buyPrice = definitionNumber(meta, 'g')
  const maxLevel = itemMaximumLevel(meta)
  const defType = definitionString(meta, 'type')
  const rows = buildStatRows(meta, actualLevel, previewLevel, statType)
  const classes = meta?.usage?.classes ?? []

  return (
    <div>
      <div className="mb-2.5 flex gap-2">
        <PriceCard label="Buy from NPC" value={meta?.buyable && previewLevel === 0 && buyPrice != null ? `${Math.round(buyPrice).toLocaleString()}g` : 'unavailable'} className="flex-1" />
        <PriceCard label="Sell to NPC" value={`${npcSaleValue(previewLevel, gift, expires, meta).toLocaleString()}g`} className="flex-1" />
      </div>

      {classes.length > 0 && (
        <>
          <SectionLabel>Eligible classes</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {classes.map((cls) => (
              <span key={cls.id} className="rounded-full border border-border px-2.5 py-1 text-xs">
                {cls.name}
                {cls.hands ? ` · ${cls.hands}H` : ''}
              </span>
            ))}
          </div>
          {!!meta?.usage?.hands.length && (
            <p className="mt-2 text-xs text-muted-foreground">
              Hands required: <span className="font-mono">{meta.usage.hands.join(' or ')}</span>
              {meta.usage.hands.length > 1 ? ' depending on class' : ''}
            </p>
          )}
        </>
      )}

      {maxLevel > 0 && (
        <>
          <SectionLabel>Level stat preview</SectionLabel>
          <p className="text-xs text-muted-foreground">Preview only - the item itself is unchanged.</p>
          <Slider value={previewLevel} min={0} max={maxLevel} step={1} onValueChange={(v) => onPreviewLevelChange(typeof v === 'number' ? v : v[0])} className="my-2" />
          <div className="text-sm font-medium text-primary">
            +{previewLevel}
            {previewLevel === actualLevel ? ' · current' : ''}
          </div>
        </>
      )}

      <SectionLabel>Item stats</SectionLabel>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stat data.</p>
      ) : (
        <div>
          {rows.map((row) => (
            <div key={row.key} className="flex justify-between border-b border-border/60 py-0.5 text-sm last:border-0">
              <span className="text-muted-foreground">{row.key.replace(/_/g, ' ')}</span>
              <span>{formatStatValue(row.key, row.value, defType)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function statSummary(stats: Record<string, unknown>): string {
  return Object.entries(stats)
    .map(([key, value]) => {
      const num = typeof value === 'number' ? value : Number(value)
      const text = Number.isFinite(num) ? `${num > 0 ? '+' : ''}${formatStatValue(key, value, undefined)}` : formatStatValue(key, value, undefined)
      return `${key.replace(/_/g, ' ')} ${text}`
    })
    .join(' · ')
}

function RelatedItemRow({
  name,
  sprite,
  detail,
  highlighted = false,
  disabled = false,
  onClick,
}: {
  name: string
  sprite?: Sprite | null
  detail: string
  highlighted?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 rounded-md border p-2 text-left transition',
        highlighted ? 'border-primary bg-primary/10' : 'border-border bg-background hover:border-primary/40',
      )}
    >
      <SpriteIcon sprite={sprite} size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{name}</div>
        {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
      </div>
    </button>
  )
}

function SetBonusSection({ set, currentId, onNavigateItem }: { set: ItemSetInfo; currentId: string; onNavigateItem: (id: string, level: number) => void }) {
  return (
    <div>
      <div className="text-sm font-semibold">Set bonus · {set.name}</div>
      {set.explanation && <p className="mb-2 mt-1 text-sm text-muted-foreground">{set.explanation}</p>}
      <div className="flex flex-col gap-1">
        {set.items.map((item) => (
          <RelatedItemRow
            key={item.id}
            name={(item.quantity > 1 ? `${item.quantity} × ` : '') + item.name}
            sprite={item.sprite}
            detail=""
            highlighted={item.id === currentId}
            onClick={() => onNavigateItem(item.id, 0)}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-col gap-1">
        {set.bonuses.map((bonus) => (
          <div key={bonus.pieces} className="flex gap-3 py-1 text-sm">
            <span className="w-20 shrink-0 font-medium text-primary">{bonus.pieces} pieces</span>
            <span className="text-muted-foreground">{statSummary(bonus.stats)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CraftableSection({ recipe, onNavigateItem }: { recipe: ItemRecipe; onNavigateItem: (id: string, level: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Craftable</span>
        <span className="text-sm text-primary">{recipe.cost.toLocaleString()}g fee</span>
      </div>
      {recipe.quest && <p className="text-xs text-muted-foreground">Requires quest: {recipe.quest}</p>}
      <div className="mt-1.5 flex flex-col gap-1">
        {recipe.materials.map((material) => (
          <RelatedItemRow
            key={`${material.id}-${material.level}`}
            name={`${material.quantity} × ${material.name}${material.level > 0 ? ` +${material.level}` : ''}`}
            sprite={material.sprite}
            detail={(material.drops ?? []).map((d) => `${d.monsterName} ${formatDropRate(d)}`).join(' · ')}
            onClick={() => onNavigateItem(material.id, material.level)}
          />
        ))}
      </div>
    </div>
  )
}

function IngredientInSection({ usedIn, onNavigateItem }: { usedIn: ItemCraftUse[]; onNavigateItem: (id: string, level: number) => void }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-semibold">Ingredient in</div>
      <div className="flex flex-col gap-1">
        {usedIn.map((use) => (
          <RelatedItemRow
            key={use.id}
            name={use.name}
            sprite={use.sprite}
            detail={`Uses ${use.quantity} ×${use.level > 0 ? ` at +${use.level}` : ''} · ${use.cost.toLocaleString()}g craft fee`}
            onClick={() => onNavigateItem(use.id, 0)}
          />
        ))}
      </div>
    </div>
  )
}

const NON_INSPECTABLE_KINDS = new Set(['empty', 'gold', 'shells', 'cx', 'cxbundle'])

/** item-exchange-details.tsx: price, rewards (as reward tiles) and sources. */
function ExchangeSection({ id, box, exchanges, onNavigateItem }: { id: string; box: boolean; exchanges: ExchangeSections; onNavigateItem: (id: string, level: number) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {exchanges.prices.length > 0 && (
        <div>
          <div className="text-sm font-semibold">Exchange price</div>
          <div className="mt-1 flex flex-col gap-1">
            {exchanges.prices.map((entry) => (
              <RelatedItemRow
                key={entry.key}
                name={`${entry.required.toLocaleString()} × ${entry.currencyName || entry.id}${entry.level ? ` +${entry.level}` : ''}`}
                sprite={entry.currencySprite}
                detail={`for ${entry.rewardQuantity || 1}`}
                onClick={() => onNavigateItem(entry.id, entry.level)}
              />
            ))}
          </div>
        </div>
      )}
      {exchanges.rewards.length > 0 && (
        <div>
          <div className="text-sm font-semibold">{box ? 'Rewards' : 'Exchange reward'}</div>
          {exchanges.rewards.map((entry) => {
            const [rewardId, rewardLevel] = entry.reward ? exchangeTarget(entry.reward) : [entry.id, 0]
            return (
              <div key={entry.key} className="mt-1.5">
                <p className="mb-1 text-xs text-muted-foreground">
                  Exchange {entry.required} × {entry.currencyName || (entry.reward ? id : entry.name)}
                  {entry.npc ? ` · ${entry.npc}` : ''}
                </p>
                <div className="flex flex-wrap items-stretch gap-2">
                  {entry.reward ? (
                    <ExchangeRewardTile
                      reward={{ id: rewardId, level: rewardLevel, name: entry.name, quantity: entry.rewardQuantity || 1, sprite: entry.sprite, detail: '100%', onInspect: () => onNavigateItem(rewardId, rewardLevel) }}
                    />
                  ) : (
                    entry.results.map((result, index) => (
                      <ExchangeRewardTile
                        key={`${entry.key}-${index}`}
                        reward={{
                          id: result.id,
                          level: 0,
                          name: result.name,
                          quantity: result.quantity,
                          sprite: result.sprite,
                          kind: result.kind,
                          detail: rewardPercentage(result.chance),
                          onInspect: () => !NON_INSPECTABLE_KINDS.has(result.kind) && onNavigateItem(result.id, 0),
                        }}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
          {id.startsWith('cosmo') && <p className="mt-2 text-xs text-muted-foreground">Base chances shown. Already-owned cosmetics change these odds.</p>}
          {id === 'sixcake' && <p className="mt-2 text-xs text-muted-foreground">Table rewards shown; anniversary bonuses are awarded separately.</p>}
        </div>
      )}
      {exchanges.sources.length > 0 && (
        <div>
          <div className="text-sm font-semibold">Reward in</div>
          <p className="mb-1 text-xs text-muted-foreground">Chance per exchange using the quantity shown</p>
          <div className="flex flex-col gap-1">
            {exchanges.sources.map((source) => (
              <RelatedItemRow
                key={source.entry.key}
                name={`${source.entry.required.toLocaleString()} × ${source.entry.name}${source.entry.level ? ` +${source.entry.level}` : ''}`}
                sprite={source.entry.sprite}
                detail={rewardPercentage(source.chance)}
                onClick={() => onNavigateItem(source.entry.id, source.entry.level)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DropsSection({ drops, onNavigateMonster }: { drops: ItemDropSource[]; onNavigateMonster: (id: string) => void }) {
  // item-details.tsx: sort by percentage (default) or name; ties by name.
  const [dropSort, setDropSort] = useState<'name' | 'percentage'>('percentage')
  const sorted = useMemo(
    () => [...drops].sort((a, b) => (dropSort === 'percentage' ? effectiveDropRate(b) - effectiveDropRate(a) : 0) || a.monsterName.localeCompare(b.monsterName)),
    [drops, dropSort],
  )
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-semibold">Monster drops</span>
        <label className="flex items-center gap-2 text-xs">
          Sort
          <select aria-label="Sort monster drops" value={dropSort} onChange={(event) => setDropSort(event.target.value as 'name' | 'percentage')} className="rounded border border-border bg-background px-2 py-1">
            <option value="name">Name</option>
            <option value="percentage">Percentage</option>
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-1">
        {sorted.map((drop, index) => (
          <RelatedItemRow key={`${drop.monsterId}-${index}`} name={drop.monsterName} sprite={drop.sprite} detail={formatDropRate(drop)} onClick={() => onNavigateMonster(drop.monsterId)} />
        ))}
      </div>
    </div>
  )
}

// Re-exported so ItemActionPanel can type its props without a separate import.
export type { CatalogItem }
