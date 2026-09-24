import { useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Chip } from '@/components/Chip'
import { Slider } from '@/components/ui/slider'
import {
  buildStatRows,
  definitionNumber,
  definitionString,
  effectiveDropRate,
  exchangeSections,
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
  className,
}: {
  rootItemId: string
  rootLevel: number
  catalog: MerchantCatalog | null | undefined
  monsters: BestiaryMonster[]
  rootStatType?: string
  rootGift?: boolean
  rootExpires?: unknown
  className?: string
}) {
  const [trail, setTrail] = useState<DetailTarget[]>([{ kind: 'item', id: rootItemId, level: rootLevel }])
  const current = trail[trail.length - 1]

  const pushItem = (id: string, level: number) => setTrail((t) => [...t, { kind: 'item', id, level }])
  const pushMonster = (id: string) => setTrail((t) => [...t, { kind: 'monster', id }])

  return (
    <div className={className}>
      {trail.length > 1 && (
        <button className="mb-1 flex items-center gap-1 text-sm text-muted-foreground" onClick={() => setTrail((t) => t.slice(0, -1))}>
          <ArrowLeft className="size-4" /> Back
        </button>
      )}
      {current.kind === 'item' ? (
        <ItemDetailContent
          target={current}
          catalog={catalog}
          isRoot={current.id === rootItemId && current.level === rootLevel && trail.length === 1}
          rootStatType={rootStatType}
          rootGift={rootGift}
          rootExpires={rootExpires}
          onNavigateItem={pushItem}
          onNavigateMonster={pushMonster}
        />
      ) : (
        <MonsterDetailContent monster={monsters.find((m) => m.id === current.id)} onNavigateItem={pushItem} />
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
  onNavigateItem,
  onNavigateMonster,
}: {
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

  const exchanges = useMemo(() => exchangeSections(target.id, target.level, catalog?.exchangeable ?? []), [catalog, target.id, target.level])

  const meta = catalogItem?.meta ?? undefined
  const world = meta?.world
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
      {activeTab === 'Exchange' && <ExchangeSection exchanges={exchanges} onNavigateItem={onNavigateItem} />}
      {activeTab === 'Drops' && world?.drops && <DropsSection drops={world.drops} onNavigateMonster={onNavigateMonster} />}
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
  onClick,
}: {
  name: string
  sprite?: Sprite | null
  detail: string
  highlighted?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
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

function ExchangeSection({ exchanges, onNavigateItem }: { exchanges: ExchangeSections; onNavigateItem: (id: string, level: number) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {exchanges.prices.length > 0 && (
        <div>
          <div className="text-sm font-semibold">Exchange price</div>
          <div className="mt-1 flex flex-col gap-1">
            {exchanges.prices.map((entry) => (
              <RelatedItemRow
                key={entry.key}
                name={`${entry.required} × ${entry.currencyName ?? entry.id}`}
                sprite={entry.currencySprite}
                detail={`for ${entry.rewardQuantity ?? 1}`}
                onClick={() => onNavigateItem(entry.id, entry.level)}
              />
            ))}
          </div>
        </div>
      )}
      {exchanges.rewards.length > 0 && (
        <div>
          <div className="text-sm font-semibold">Exchange reward</div>
          {exchanges.rewards.map((entry) => (
            <div key={entry.key} className="mt-1.5">
              <p className="mb-1 text-xs text-muted-foreground">
                Exchange {entry.required} × {entry.currencyName ?? entry.name}
                {entry.npc ? ` · ${entry.npc}` : ''}
              </p>
              <div className="flex flex-col gap-1">
                {entry.reward ? (
                  <RelatedItemRow name={entry.name} sprite={entry.sprite} detail="100%" onClick={() => onNavigateItem(entry.id, entry.level)} />
                ) : (
                  entry.results.map((result, index) => (
                    <RelatedItemRow
                      key={`${entry.key}-${index}`}
                      name={`${result.quantity} × ${result.name}`}
                      sprite={result.sprite}
                      detail={rewardPercentage(result.chance)}
                      onClick={() => !NON_INSPECTABLE_KINDS.has(result.kind) && onNavigateItem(result.id, 0)}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
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
                name={`${source.entry.required} × ${source.entry.name}`}
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
  const sorted = useMemo(() => [...drops].sort((a, b) => effectiveDropRate(b) - effectiveDropRate(a)), [drops])
  return (
    <div>
      <div className="mb-1.5 text-sm font-semibold">Monster drops</div>
      <div className="flex flex-col gap-1">
        {sorted.map((drop, index) => (
          <RelatedItemRow key={`${drop.monsterId}-${index}`} name={drop.monsterName} sprite={drop.sprite} detail={formatDropRate(drop)} onClick={() => onNavigateMonster(drop.monsterId)} />
        ))}
      </div>
    </div>
  )
}

function MonsterDetailContent({ monster, onNavigateItem }: { monster: BestiaryMonster | undefined; onNavigateItem: (id: string, level: number) => void }) {
  if (!monster) return <p className="py-4 text-sm text-muted-foreground">No bestiary data for this monster yet.</p>
  const sorted = [...monster.drops].sort((a, b) => b.rate - a.rate)
  return (
    <div>
      <div className="mb-1 text-base font-semibold">{monster.name}</div>
      <p className="mb-2.5 text-sm text-muted-foreground">
        HP {monster.hp.toLocaleString()} · ATK {monster.attack.toLocaleString()} · XP {monster.xp.toLocaleString()}
      </p>
      <div className="mb-1.5 text-sm font-semibold">Drops</div>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No known drops.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {sorted.map((drop) => (
            <RelatedItemRow
              key={drop.id}
              name={drop.name + (drop.quantity > 1 ? ` x${drop.quantity}` : '')}
              sprite={drop.sprite}
              detail={`${(drop.rate * 100).toFixed(4)}%`}
              onClick={() => onNavigateItem(drop.id, 0)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Re-exported so ItemActionPanel can type its props without a separate import.
export type { CatalogItem }
