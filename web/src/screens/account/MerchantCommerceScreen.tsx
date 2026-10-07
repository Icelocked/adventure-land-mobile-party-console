import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCharacters, useDomainInterest, useDynamicState, usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { inventoryCounts } from '@/lib/inventoryCounts'
import { upgradeEstimate } from '@/lib/suggestedItemValue'
import type { ApiResult } from '@/api/partyApi'
import { automaticCommerceRuleKey } from '@/models'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Chip } from '@/components/Chip'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'
import { ChevronDown, ChevronUp, Settings, X } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ItemDetailBrowser } from '@/screens/itemdetail/ItemDetailBrowser'
import { ExchangeMarkControls, ExchangeRewardTile, type ExchangeMarkMode, type ExchangeRewardTileData } from '@/components/ExchangeReward'
import type { CraftMaterial, MerchantBuyItem, MerchantCraftRecipe, MerchantExchangeItem } from '@/models'

type Mode = 'buy' | 'craft' | 'exchange'
const MODES: Mode[] = ['buy', 'craft', 'exchange']

/** Merchant buy/craft/exchange, as a full screen since a cart doesn't fit
 *  a phone-sized dialog. Console: merchant-commerce-dialog.tsx. */

// Quantities are capped at 9999.
const capQuantity = (value: string) => Math.min(9999, Math.max(0, Number(value.replace(/[^0-9]/g, '')) || 0))

/** A cart line's quantity box. Clearing it to type a new number keeps the
 *  line (only Remove takes it out of the cart); left empty or at 0, it goes
 *  back to the last quantity. */
function QuantityInput({ label, value, onChange }: { label: string; value: number; onChange: (quantity: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <Input
      aria-label={label}
      inputMode="numeric"
      value={draft ?? String(value)}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^0-9]/g, '')
        const quantity = capQuantity(digits)
        setDraft(quantity > 0 ? String(quantity) : digits)
        if (quantity > 0) onChange(quantity)
      }}
      onBlur={() => setDraft(null)}
      className="h-8 w-14 px-1.5 text-center text-xs"
    />
  )
}

type Inventories = { name: string; items?: ({ item?: { name?: string; level?: number; q?: number } | null } | null)[] }[]
function inventories(characters: ReturnType<typeof useCharacters>, filter: (state: ReturnType<typeof useCharacters>[string]) => boolean = () => true): Inventories {
  return Object.entries(characters)
    .filter(([, state]) => filter(state))
    .map(([name, state]) => ({ name, items: state.inventory?.items ?? [] }))
}

/** The error message plus each 409 `missing` entry. */
function orderError(result: Extract<ApiResult<unknown>, { kind: 'failure' }>) {
  const missing = Array.isArray(result.body?.missing) ? (result.body.missing as { id: string; level?: number; required: number; available: number }[]) : []
  return (result.message || 'Could not queue order') + missing.map((item) => ` · ${item.id} +${item.level || 0}: ${item.required} required, ${item.available} available`).join('')
}
export function MerchantCommerceScreen() {
  const { mode: modeParam } = useParams<{ mode: string }>()
  const mode: Mode = MODES.includes(modeParam as Mode) ? (modeParam as Mode) : 'buy'
  const navigate = useNavigate()
  const dynamicState = useDynamicState()
  const characters = useCharacters()
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const catalog = dynamicState.merchantCatalog
  useDomainInterest('bank')

  const [search, setSearch] = useState('')
  const [buyCart, setBuyCart] = useState<Record<string, { quantity: number; level: number }>>({})
  const [craftCart, setCraftCart] = useState<Record<string, number>>({})
  const [exchangeCart, setExchangeCart] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const owned = useMemo(() => inventoryCounts(inventories(characters), dynamicState.bank, dynamicState.bankbois, true), [characters, dynamicState.bank, dynamicState.bankbois])
  const buyableById = useMemo(() => Object.fromEntries((catalog?.buyable ?? []).map((item) => [item.id, item])), [catalog])

  const setModeParam = (next: Mode) => {
    // Switching mode clears the search.
    if (next !== mode) setSearch('')
    navigate(`/merchant/${next}`, { replace: true })
  }

  if (mode === 'buy') {
    return (
      <BuyScreen
        search={search}
        setSearch={setSearch}
        setMode={setModeParam}
        catalog={catalog?.buyable ?? []}
        cart={buyCart}
        setCart={setBuyCart}
        onSubmit={async (lines) => {
          setSubmitting(true)
          setError(null)
          const result = await api.submitMerchantOrder(lines, [])
          setSubmitting(false)
          if (result.kind === 'failure') setError(orderError(result))
          else {
            setBuyCart({})
            await refreshNow()
            navigate(-1)
          }
        }}
        submitting={submitting}
        error={error}
      />
    )
  }
  if (mode === 'craft') {
    return (
      <CraftScreen
        search={search}
        setSearch={setSearch}
        setMode={setModeParam}
        recipes={catalog?.craftable ?? []}
        buyableById={buyableById}
        owned={owned}
        cart={craftCart}
        setCart={setCraftCart}
        onSubmit={async () => {
          setSubmitting(true)
          setError(null)
          const lines = Object.entries(craftCart)
            .filter(([, quantity]) => quantity > 0)
            .map(([id, quantity]) => ({ id, quantity }))
          const result = await api.submitMerchantOrder([], lines)
          setSubmitting(false)
          if (result.kind === 'failure') setError(orderError(result))
          else {
            setCraftCart({})
            await refreshNow()
            navigate(-1)
          }
        }}
        submitting={submitting}
        error={error}
      />
    )
  }
  return (
    <ExchangeScreen
      search={search}
      setSearch={setSearch}
      setMode={setModeParam}
      exchangeable={catalog?.exchangeable ?? []}
      characters={characters}
      bank={dynamicState.bank}
      bankbois={dynamicState.bankbois}
      cart={exchangeCart}
      setCart={setExchangeCart}
      onSubmit={async () => {
        setSubmitting(true)
        setError(null)
        const byKey = new Map<string, MerchantExchangeItem>((catalog?.exchangeable ?? []).map((item) => [item.key, item]))
        const lines = Object.entries(exchangeCart)
          .filter(([, quantity]) => quantity > 0)
          .map(([key, quantity]) => {
            const item = byKey.get(key)
            return { id: item?.id ?? key, quantity, level: item?.level ?? 0, reward: item?.reward ?? undefined }
          })
        const result = await api.submitExchangeOrder(lines)
        setSubmitting(false)
        if (result.kind === 'failure') setError(orderError(result))
        else {
          setExchangeCart({})
          await refreshNow()
          navigate(-1)
        }
      }}
      submitting={submitting}
      error={error}
    />
  )
}

function ModeTabs({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="flex gap-1.5 px-3 pb-2 pt-1">
      {MODES.map((m) => (
        <Chip key={m} selected={mode === m} onClick={() => setMode(m)}>
          {m === 'buy' ? 'Buy' : m === 'craft' ? 'Craft' : 'Exchange'}
        </Chip>
      ))}
    </div>
  )
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="px-3 pb-2">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search items…" />
    </div>
  )
}

function ItemRow({
  name,
  sprite,
  subtitle,
  disabled,
  onAdd,
  itemId,
  addLabel = 'Add',
  source = 'Merchant catalog',
}: {
  /** The item-details header's source. */
  source?: string
  /** Tapping a catalog tile opens its item details. */
  itemId?: string
  name: string
  sprite?: { url: string; tileSize: number; columns: number; rows: number; x: number; y: number } | null
  subtitle: string
  disabled?: boolean
  onAdd: () => void
  addLabel?: string
}) {
  const state = useDynamicState()
  const [inspecting, setInspecting] = useState(false)
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card p-2.5">
      <button type="button" aria-label={`Inspect ${name}`} disabled={!itemId} onClick={() => setInspecting(true)} className={`flex min-w-0 flex-1 items-center gap-3 text-left ${disabled ? 'opacity-40' : ''}`}>
        <SpriteIcon sprite={sprite} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="font-mono text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </button>
      <Button size="sm" disabled={disabled} onClick={onAdd}>
        {addLabel}
      </Button>
      {inspecting && itemId && (
        <Sheet open onOpenChange={(open) => !open && setInspecting(false)}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
            <ItemDetailBrowser rootItemId={itemId} rootLevel={0} catalog={state.merchantCatalog} monsters={state.bestiaryCatalog} context={{ character: source, slot: -1 }} />
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}

function CartRow({ cartKey, children }: { cartKey: string; children: ReactNode }) {
  return (
    <div data-cart-key={cartKey} className="flex flex-wrap items-center gap-2 border-t border-border py-2 first:border-t-0">
      {children}
    </div>
  )
}

function SubmitBar({ label, disabled, submitting, error, onSubmit }: { label: string; disabled: boolean; submitting: boolean; error: string | null; onSubmit: () => void }) {
  return (
    <div className="border-t border-border bg-background p-3">
      {error && <p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}
      <Button className="w-full" disabled={disabled || submitting} onClick={onSubmit}>
        {submitting ? 'Queuing...' : label}
      </Button>
    </div>
  )
}


/** The cart, pinned to the bottom of the screen so an added item shows at
 *  once while the list scrolls above it. Adding something opens it and
 *  scrolls to that item's line; the header folds it to a summary. `footer`
 *  stays visible above the submit button. */
function CartDock({
  title,
  quantities,
  summary,
  footer,
  submit,
  children,
}: {
  title: string
  quantities: Record<string, number>
  summary?: ReactNode
  footer?: ReactNode
  submit: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  const body = useRef<HTMLDivElement>(null)
  const previous = useRef(quantities)
  const lines = Object.values(quantities).filter((quantity) => quantity > 0).length
  useEffect(() => {
    const added = Object.keys(quantities).find((key) => (quantities[key] ?? 0) > (previous.current[key] ?? 0))
    previous.current = quantities
    if (!added) return
    setOpen(true)
    requestAnimationFrame(() => {
      const row = body.current?.querySelector<HTMLElement>(`[data-cart-key="${CSS.escape(added)}"]`)
      if (row && body.current) body.current.scrollTo({ top: row.offsetTop - body.current.offsetTop - 8 })
    })
  }, [quantities])
  return (
    <section
      aria-label={title}
      className="sticky bottom-0 z-10 mt-3 border-t border-border bg-background shadow-[0_-6px_16px_rgba(0,0,0,0.45)] md:top-2 md:bottom-auto md:mt-0 md:rounded-lg md:border md:shadow-none"
    >
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <span className="font-mono text-xs uppercase text-muted-foreground">
          {title}
          {lines ? ` (${lines})` : ''}
        </span>
        {summary && <span className="ml-auto font-mono text-xs text-primary">{summary}</span>}
        {open ? <ChevronDown className={summary ? 'size-4' : 'ml-auto size-4'} /> : <ChevronUp className={summary ? 'size-4' : 'ml-auto size-4'} />}
      </button>
      {open && (
        <div ref={body} className="relative max-h-[40vh] overflow-y-auto px-3 pb-2 md:max-h-[calc(100dvh-12rem)]">
          {children}
        </div>
      )}
      {footer}
      {submit}
    </section>
  )
}

function BuyScreen({
  search,
  setSearch,
  setMode,
  catalog,
  cart,
  setCart,
  onSubmit,
  submitting,
  error,
}: {
  search: string
  setSearch: (v: string) => void
  setMode: (m: Mode) => void
  catalog: MerchantBuyItem[]
  cart: Record<string, { quantity: number; level: number }>
  setCart: (fn: (old: Record<string, { quantity: number; level: number }>) => Record<string, { quantity: number; level: number }>) => void
  onSubmit: (lines: { id: string; quantity: number; level?: number; budget?: number; maxAttempts?: number }[]) => void
  submitting: boolean
  error: string | null
}) {
  const filtered = catalog.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(search.toLowerCase()))
  const selected = catalog.filter((item) => (cart[item.id]?.quantity ?? 0) > 0)
  const estimates = Object.fromEntries(selected.map((item) => [item.id, upgradeEstimate(item, cart[item.id].quantity, cart[item.id]?.level || 0)]))
  const hasEstimatedGold = selected.some((item) => (cart[item.id]?.level || 0) > 0 && item.upgradeable)
  const goldTotal = selected.reduce((sum, item) => sum + estimates[item.id].gold, 0)
  const unlikely = selected.filter((item) => estimates[item.id].unlikely)
  const lines = () =>
    selected.map((item) => ({
      id: item.id,
      quantity: cart[item.id].quantity,
      ...(cart[item.id]?.level ? { level: cart[item.id].level } : {}),
      ...(item.upgradeable ? { budget: estimates[item.id].gold, maxAttempts: estimates[item.id].attempts } : {}),
    }))

  return (
    <AccountScreenScaffold title="Merchant shopping">
      <ModeTabs mode="buy" setMode={setMode} />
      <p className="px-3 pb-1 text-xs text-muted-foreground">Choose anything sold for gold.</p>
      <SearchBar value={search} onChange={setSearch} />
      {/* Wide screens: the cart is a column beside the list instead of a bottom bar. */}
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_22rem] md:items-start md:gap-3 md:pr-3">
      {filtered.length === 0 ? (
        <EmptyState message="No buyable items found." />
      ) : (
        <div className="flex flex-col gap-1.5 px-3">
          {filtered.map((item) => (
            <ItemRow
              key={item.id}
              itemId={item.id}
              name={item.name}
              sprite={item.sprite}
              subtitle={`${item.cost.toLocaleString()}g`}
              onAdd={() => setCart((old) => ({ ...old, [item.id]: { quantity: (old[item.id]?.quantity ?? 0) + 1, level: old[item.id]?.level ?? 0 } }))}
            />
          ))}
        </div>
      )}

      <CartDock
        title="Cart"
        quantities={Object.fromEntries(Object.entries(cart).map(([id, line]) => [id, line.quantity]))}
        summary={`Gold${hasEstimatedGold ? ' (est)' : ''}: ${goldTotal.toLocaleString()}g`}
        submit={<SubmitBar label="Buy all" disabled={!selected.length || unlikely.length > 0} submitting={submitting} error={error} onSubmit={() => onSubmit(lines())} />}
      >
          {!selected.length && <p className="text-xs text-muted-foreground">Nothing selected.</p>}
          {selected.map((item) => {
            const line = cart[item.id]
            return (
              <CartRow key={item.id} cartKey={item.id}>
                <SpriteIcon sprite={item.sprite} size={28} />
                <span className="min-w-0 flex-1 truncate text-xs">{item.name}</span>
                <QuantityInput
                  label={`${item.name} quantity`}
                  value={line.quantity}
                  onChange={(quantity) => setCart((old) => ({ ...old, [item.id]: { ...old[item.id], quantity } }))}
                />
                {item.upgradeable && (
                  <label className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
                    Target
                    <Input
                      aria-label={`${item.name} target level`}
                      value={`+${line.level}`}
                      onChange={(e) => setCart((old) => ({ ...old, [item.id]: { ...old[item.id], level: Math.max(0, Math.min(13, Number(e.target.value.replace(/\D/g, '')) || 0)) } }))}
                      className="h-8 w-14 px-1.5 text-center text-xs"
                    />
                  </label>
                )}
                <Button variant="link" size="xs" className="text-destructive" onClick={() => setCart((old) => ({ ...old, [item.id]: { quantity: 0, level: 0 } }))}>
                  Remove
                </Button>
                {line.level > 0 && item.upgradeable && estimates[item.id].unlikely ? (
                  <p className="ml-9 w-full text-[11px] text-amber-400">+{line.level} is too unlikely to estimate a budget for. Choose a lower target level.</p>
                ) : line.level > 0 && item.upgradeable ? (
                  <p className="ml-9 w-full font-mono text-[10px] text-violet-300">
                    90% budget: {estimates[item.id].attempts} base items ·{' '}
                    {estimates[item.id].scrolls
                      .map((count, grade) => (count ? `${count} scroll${grade}` : ''))
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                ) : null}
              </CartRow>
            )
          })}
      </CartDock>
      </div>
    </AccountScreenScaffold>
  )
}


function CraftScreen({
  search,
  setSearch,
  setMode,
  recipes,
  buyableById,
  owned,
  cart,
  setCart,
  onSubmit,
  submitting,
  error,
}: {
  search: string
  setSearch: (v: string) => void
  setMode: (m: Mode) => void
  recipes: MerchantCraftRecipe[]
  buyableById: Record<string, MerchantBuyItem>
  owned: Record<string, number>
  cart: Record<string, number>
  setCart: (fn: (old: Record<string, number>) => Record<string, number>) => void
  onSubmit: () => void
  submitting: boolean
  error: string | null
}) {
  const filtered = recipes.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(search.toLowerCase()))
  const canPurchaseMaterial = (material: CraftMaterial) => (material.level ?? 0) === 0 && !!buyableById[material.id]

  const requirements = useMemo(() => {
    const required: Record<string, { material: CraftMaterial; quantity: number }> = {}
    recipes.forEach((recipe) => {
      const quantity = cart[recipe.id] ?? 0
      if (quantity <= 0) return
      recipe.materials.forEach((material) => {
        const key = `${material.id}@${material.level ?? 0}`
        if (!required[key]) required[key] = { material, quantity: 0 }
        required[key].quantity += material.quantity * quantity
      })
    })
    return required
  }, [cart, recipes])

  const canAddRecipe = (recipe: MerchantCraftRecipe) =>
    recipe.materials.every((material) => {
      const key = `${material.id}@${material.level ?? 0}`
      const needed = (requirements[key]?.quantity ?? 0) + material.quantity
      return needed <= (owned[key] ?? 0) || canPurchaseMaterial(material)
    })

  const ingredientPurchaseCost = Object.entries(requirements).reduce((sum, [key, requirement]) => {
    const missing = Math.max(0, requirement.quantity - (owned[key] || 0))
    return sum + missing * (buyableById[requirement.material.id]?.cost || 0)
  }, 0)
  const additionalRecipeCost = (recipe: MerchantCraftRecipe) =>
    recipe.cost +
    recipe.materials.reduce((sum, material) => {
      const key = `${material.id}@${material.level || 0}`
      const before = Math.max(0, (requirements[key]?.quantity || 0) - (owned[key] || 0))
      const after = Math.max(0, (requirements[key]?.quantity || 0) + material.quantity - (owned[key] || 0))
      return sum + (after - before) * (buyableById[material.id]?.cost || 0)
    }, 0)
  const [previewing, setPreviewing] = useState<string | null>(null)

  const selected = recipes.filter((item) => (cart[item.id] ?? 0) > 0)
  const goldTotal = selected.reduce((sum, item) => sum + item.cost * cart[item.id], 0) + ingredientPurchaseCost
  // Per-recipe canAddRecipe only guards the +1 tap; a quantity typed into
  // the cart bypasses it, so submit needs its own aggregate check across
  // every material's running total.
  const [showIngredients, setShowIngredients] = useState(false)
  const missingMaterials = Object.entries(requirements)
    .filter(([key, requirement]) => requirement.quantity > (owned[key] ?? 0) && !canPurchaseMaterial(requirement.material))
    .map(([, requirement]) => requirement.material.name + (requirement.material.level ? ` +${requirement.material.level}` : ''))
  const ingredientsToBuy = Object.entries(requirements).reduce(
    (sum, [key, requirement]) => sum + (canPurchaseMaterial(requirement.material) ? Math.max(0, requirement.quantity - (owned[key] ?? 0)) : 0),
    0,
  )
  const materialsAvailable = Object.entries(requirements).every(
    ([key, requirement]) => requirement.quantity <= (owned[key] ?? 0) || canPurchaseMaterial(requirement.material),
  )

  return (
    <AccountScreenScaffold title="Merchant crafting">
      <ModeTabs mode="craft" setMode={setMode} />
      <p className="px-3 pb-1 text-xs text-muted-foreground">Recipes account for materials held by the active party and in the latest bank snapshot.</p>
      <SearchBar value={search} onChange={setSearch} />
      {/* Wide screens: the cart is a column beside the list instead of a bottom bar. */}
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_22rem] md:items-start md:gap-3 md:pr-3">
      {filtered.length === 0 ? (
        <EmptyState message="No craftable recipes found." />
      ) : (
        <div className="flex flex-col gap-1.5 px-3">
          {filtered.map((recipe) => {
            const enabled = canAddRecipe(recipe)
            const open = previewing === recipe.id
            return (
              <div key={recipe.id} className="flex flex-col gap-1">
                <ItemRow source="Crafting catalog"
                  itemId={recipe.id}
                  name={recipe.name}
                  sprite={recipe.sprite}
                  subtitle={`${recipe.cost.toLocaleString()}g + materials`}
                  disabled={!enabled}
                  onAdd={() => setCart((old) => ({ ...old, [recipe.id]: (old[recipe.id] ?? 0) + 1 }))}
                />
                {/* A phone has no hover, so the recipe preview toggles inline. */}
                <Button variant="link" size="xs" className="self-start text-violet-300" aria-expanded={open} onClick={() => setPreviewing(open ? null : recipe.id)}>
                  {open ? 'Hide recipe' : 'Complete recipe'}
                </Button>
                {open && (
                  <div role="group" aria-label={`${recipe.name} recipe`} className="rounded-md border border-violet-600 bg-card p-2.5">
                    <p className="text-sm font-semibold text-violet-200">{recipe.name}</p>
                    <p className="mb-2 font-mono text-[10px] uppercase text-violet-300">Complete recipe</p>
                    {recipe.materials.map((material) => {
                      const available = owned[`${material.id}@${material.level || 0}`] || 0
                      return (
                        <div key={`${material.id}-${material.level}`} className="flex items-center gap-2 py-1">
                          <SpriteIcon sprite={material.sprite} size={28} />
                          <span className="min-w-0 flex-1 text-xs">
                            {material.quantity} × {material.name}
                            {material.level ? ` +${material.level}` : ''}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                            {available >= material.quantity
                              ? `${available} owned`
                              : canPurchaseMaterial(material)
                                ? `${available} owned · buy ${material.quantity - available}`
                                : `${available} owned · missing`}
                          </span>
                        </div>
                      )
                    })}
                    <p className="mt-2 border-t border-violet-800 pt-2 text-right font-mono text-xs text-amber-300">
                      Next craft: {additionalRecipeCost(recipe).toLocaleString()}g total
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <CartDock
        title="Craft list"
        quantities={cart}
        summary={`Gold: ${goldTotal.toLocaleString()}g`}
        footer={
          selected.length ? (
            <button
              type="button"
              aria-expanded={showIngredients}
              onClick={() => setShowIngredients((value) => !value)}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-1.5 text-left font-mono text-[11px]"
            >
              {missingMaterials.length ? (
                <span className="min-w-0 flex-1 truncate text-destructive">Missing: {missingMaterials.join(', ')}</span>
              ) : (
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  Ingredients: {Object.keys(requirements).length}
                  {ingredientsToBuy ? ` · buy ${ingredientsToBuy}` : ' · all owned'}
                </span>
              )}
              <span className="shrink-0 text-muted-foreground">{showIngredients ? 'Hide' : 'Show'}</span>
            </button>
          ) : null
        }
        submit={<SubmitBar label="Craft" disabled={!selected.length || !materialsAvailable} submitting={submitting} error={error} onSubmit={onSubmit} />}
      >
          {!selected.length && <p className="text-xs text-muted-foreground">Nothing selected.</p>}
          {selected.map((item) => (
            <CartRow key={item.id} cartKey={item.id}>
              <SpriteIcon sprite={item.sprite} size={28} />
              <span className="min-w-0 flex-1 truncate text-xs">{item.name}</span>
              <QuantityInput label={`${item.name} quantity`} value={cart[item.id]} onChange={(quantity) => setCart((old) => ({ ...old, [item.id]: quantity }))} />
              <Button variant="link" size="xs" className="text-destructive" onClick={() => setCart((old) => ({ ...old, [item.id]: 0 }))}>
                Remove
              </Button>
            </CartRow>
          ))}
          {showIngredients && selected.length > 0 && <div className="mt-2 border-t border-border pt-2">
            <p className="mb-1 font-mono text-[10px] uppercase text-muted-foreground">Ingredient totals</p>
            {Object.entries(requirements).map(([key, requirement]) => {
              const available = owned[key] ?? 0
              const ok = requirement.quantity <= available || canPurchaseMaterial(requirement.material)
              return (
                <div key={key} className="flex items-center gap-2 border-t border-border py-1.5 first:border-t-0">
                  <SpriteIcon sprite={requirement.material.sprite} size={22} />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {requirement.material.name}
                    {requirement.material.level ? ` +${requirement.material.level}` : ''}
                  </span>
                  <span className={`shrink-0 font-mono text-[10px] ${ok ? 'text-muted-foreground' : 'text-destructive'}`}>
                    {requirement.quantity} needed · {available} owned
                    {requirement.quantity > available && canPurchaseMaterial(requirement.material) ? ` · buy ${requirement.quantity - available}` : ''}
                  </span>
                </div>
              )
            })}
          </div>}
      </CartDock>
      </div>
    </AccountScreenScaffold>
  )
}


/** Every exchange with a fixed
 *  `reward` groups under one synthetic currency tile with `choices`; box
 *  and table pulls stay their own tiles. UI-only, hence the local type. */
type GroupedExchangeItem = MerchantExchangeItem & { choices?: MerchantExchangeItem[] }

function groupExchangeItems(items: MerchantExchangeItem[]): GroupedExchangeItem[] {
  const rows: GroupedExchangeItem[] = []
  for (const item of items) {
    if (!item.reward) {
      rows.push(item)
      continue
    }
    let currency = rows.find((row) => row.choices && row.id === item.id)
    if (!currency) {
      currency = {
        ...item,
        key: `${item.id}@choose`,
        name: item.currencyName || item.id,
        sprite: item.currencySprite ?? null,
        reward: undefined,
        required: 0,
        choices: [],
      }
      rows.push(currency)
    }
    currency.choices!.push(item)
  }
  return rows
}

type Inspecting = { id: string; level: number; exchangeAdd?: { enabled: boolean; onAdd: () => void } }

function ExchangeScreen({
  search,
  setSearch,
  setMode,
  exchangeable,
  characters,
  bank,
  bankbois,
  cart,
  setCart,
  onSubmit,
  submitting,
  error,
}: {
  search: string
  setSearch: (v: string) => void
  setMode: (m: Mode) => void
  exchangeable: MerchantExchangeItem[]
  characters: ReturnType<typeof useCharacters>
  bank: ReturnType<typeof useDynamicState>['bank']
  bankbois: ReturnType<typeof useDynamicState>['bankbois']
  cart: Record<string, number>
  setCart: (fn: (old: Record<string, number>) => Record<string, number>) => void
  onSubmit: () => void
  submitting: boolean
  error: string | null
}) {
  const api = usePartyApi()
  const state = useDynamicState()
  const refreshNow = useRefreshDynamicStateNow()
  // Owned counts span merchant-class characters, the bank and bankbois.
  const exchangeOwned = useMemo(
    () => inventoryCounts(inventories(characters, (entry) => entry.vitals?.ctype === 'merchant'), bank, bankbois, true),
    [characters, bank, bankbois],
  )
  const [selectedExchange, setSelectedExchange] = useState<GroupedExchangeItem | null>(null)
  const [marking, setMarking] = useState(false)
  const [markMode, setMarkMode] = useState<ExchangeMarkMode | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { id: string; level: number; mode: ExchangeMarkMode }>>({})
  const [savingMarks, setSavingMarks] = useState(false)
  const [markError, setMarkError] = useState<string | null>(null)
  const [inspecting, setInspecting] = useState<Inspecting | null>(null)

  const grouped = useMemo(() => groupExchangeItems(exchangeable), [exchangeable])
  const filtered = grouped.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(search.toLowerCase()))
  const selected = exchangeable.filter((item) => Number(cart[item.key]) > 0)

  const exchangeRequired = (id: string, level: number) =>
    exchangeable.reduce((sum, item) => sum + (item.id === id && item.level === level ? item.required * (cart[item.key] || 0) : 0), 0)
  const add = (key: string) => setCart((old) => ({ ...old, [key]: (old[key] || 0) + 1 }))
  const exchangesAvailable = selected.every((item) => exchangeRequired(item.id, item.level) <= (exchangeOwned[`${item.id}@${item.level || 0}`] || 0))

  function openRules(item: GroupedExchangeItem | null) {
    setSelectedExchange(item)
    setMarking(false)
    setMarkMode(null)
    setDrafts({})
    setMarkError(null)
  }
  async function saveDrafts(list: { id: string; level: number; mode: ExchangeMarkMode }[]) {
    const character = state.merchantCharacter
    if (!character) throw new Error('No merchant is assigned')
    for (const draft of list) {
      const item = { name: draft.id, level: draft.level }
      let result
      if (draft.mode.action === 'bank') result = await api.itemCommand('auto-item-mark', character, item, undefined, { mode: 'bank', action: 'set' })
      else if (draft.mode.action === 'upgrade') result = await api.itemCommand('auto-upgrade-mark', character, item, -1, { tiers: Number(draft.mode.targetLevel) - draft.level })
      else if (draft.mode.action === 'npc') result = await api.autoNpcSale(undefined, item)
      else {
        const meta = state.merchantCatalog?.allItems?.find((entry) => entry.id === draft.id)?.meta
        const price = (state.autoStandMarks?.[automaticCommerceRuleKey(item)] as { price?: number } | undefined)?.price || Math.max(1, Number(meta?.definition.g) || 1)
        result = await api.autoStand(item, price)
      }
      if (result.kind === 'failure') throw new Error(result.message)
    }
    await refreshNow()
  }
  async function toggleMarking() {
    if (!marking) {
      setMarking(true)
      setMarkError(null)
      return
    }
    setSavingMarks(true)
    setMarkError(null)
    try {
      if (Object.keys(drafts).length) await saveDrafts(Object.values(drafts))
      setDrafts({})
      setMarking(false)
      setMarkMode(null)
    } catch (caught) {
      setMarkError(caught instanceof Error ? caught.message : 'Could not save exchange rules')
    } finally {
      setSavingMarks(false)
    }
  }
  const renderReward = (reward: ExchangeRewardTileData) => (
    <ExchangeRewardTile
      reward={{
        ...reward,
        marking,
        markMode,
        saving: savingMarks,
        stagedMode: drafts[`${reward.id}@${reward.level}`]?.mode,
        onStage: (item, mode) => setDrafts((current) => ({ ...current, [`${item.id}@${item.level}`]: { id: item.id, level: item.level, mode } })),
      }}
    />
  )
  const inspectCatalog = (id: string, level = 0) => {
    if (state.merchantCatalog?.allItems?.some((entry) => entry.id === id)) setInspecting({ id, level })
  }

  return (
    <AccountScreenScaffold title="Exchange">
      <ModeTabs mode="exchange" setMode={setMode} />
      <p className="px-3 pb-1 text-xs text-muted-foreground">Choose exchange operations backed by the merchant inventory and latest bank snapshot.</p>
      <SearchBar value={search} onChange={setSearch} />
      {/* Wide screens: the cart is a column beside the list instead of a bottom bar. */}
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_22rem] md:items-start md:gap-3 md:pr-3">
      {filtered.length === 0 ? (
        <EmptyState message="No exchange operations available." />
      ) : (
        <div className="flex flex-col gap-1.5 px-3">
          {filtered.map((item) => {
            const ownedCount = exchangeOwned[`${item.id}@${item.level || 0}`] || 0
            const enabled = item.choices ? true : ownedCount >= item.required * ((cart[item.key] || 0) + 1)
            const addOrChoose = () => (item.choices ? openRules(item) : add(item.key))
            return (
              <div key={item.key} className="flex items-center gap-2 rounded-md border border-border bg-card p-2.5">
                <button
                  type="button"
                  aria-label={`Inspect ${item.name}`}
                  onClick={() => setInspecting({ id: item.id, level: 0, exchangeAdd: { enabled, onAdd: addOrChoose } })}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <SpriteIcon sprite={item.sprite} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{item.name}</div>
                    <div className="font-mono text-xs text-amber-300">{item.choices ? `${ownedCount} owned` : `${item.required} required · ${ownedCount} owned`}</div>
                  </div>
                </button>
                <Button size="icon" variant="outline" className="size-8" aria-label={`Exchange rules for ${item.name}`} onClick={() => openRules(item)}>
                  <Settings className="size-4" />
                </Button>
                <Button size="sm" disabled={!enabled} onClick={addOrChoose}>
                  {item.choices ? 'Choose' : 'Add'}
                </Button>
              </div>
            )
          })}
        </div>
      )}

      <CartDock
        title="Exchange cart"
        quantities={cart}
        submit={<SubmitBar label="Exchange all" disabled={!selected.length || !exchangesAvailable} submitting={submitting} error={error} onSubmit={onSubmit} />}
      >
          {!selected.length && <p className="text-xs text-muted-foreground">Nothing selected.</p>}
          {selected.map((item) => (
            <CartRow key={item.key} cartKey={item.key}>
              <SpriteIcon sprite={item.sprite} size={28} />
              <span className="min-w-0 flex-1 truncate text-xs">
                {item.name}
                {` ${(item.rewardQuantity ?? 1) > 1 ? `× ${item.rewardQuantity}` : ''} · uses ${item.required} ${item.currencyName || 'ea.'}`}
              </span>
              <QuantityInput label={`${item.name} quantity`} value={cart[item.key]} onChange={(quantity) => setCart((old) => ({ ...old, [item.key]: quantity }))} />
              <Button variant="link" size="xs" className="text-destructive" onClick={() => setCart((old) => ({ ...old, [item.key]: 0 }))}>
                Remove
              </Button>
            </CartRow>
          ))}
      </CartDock>
      </div>

      {selectedExchange && (
        <div role="group" aria-label="Exchange details" className="fixed inset-0 z-50 flex flex-col bg-background p-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <SpriteIcon sprite={selectedExchange.sprite} size={44} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-cyan-100">{selectedExchange.name}</p>
                <p className="font-mono text-[10px] uppercase text-cyan-300">{selectedExchange.choices ? 'Choose a reward' : `${selectedExchange.required} required per exchange`}</p>
              </div>
            </div>
            <Button size="icon" variant="outline" onClick={() => openRules(null)} disabled={savingMarks} aria-label="Close exchange details" className="border-rose-700 text-rose-300">
              <X className="size-4" />
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={savingMarks} onClick={() => void toggleMarking()} aria-busy={savingMarks} className="w-32 border-emerald-500">
              {marking ? 'Done' : 'Mark multiple'}
            </Button>
            <ExchangeMarkControls enabled={marking} mode={markMode} saving={savingMarks} onMode={setMarkMode} />
          </div>
          {marking && (
            <p className="mt-3 text-xs text-sky-200">
              {Object.keys(drafts).length} pending changes. Done saves; closing discards.
              {markMode?.action === 'stand' ? ' Existing prices are kept; new stand rules use the item gold value.' : ''}
            </p>
          )}
          {markError && <p role="alert" className="mt-2 text-sm text-rose-300">{markError}</p>}
          <p className="mt-4 font-mono text-xs uppercase text-emerald-300">{selectedExchange.choices ? 'Available rewards' : 'Potential results'}</p>
          <div className={`mt-2 min-h-0 flex-1 content-start gap-2 overflow-y-auto ${selectedExchange.choices ? 'flex flex-col' : 'flex flex-wrap items-stretch'}`}>
            {selectedExchange.choices?.map((choice) => (
              <div key={choice.key} className="flex items-center gap-3 rounded border border-cyan-800 bg-card p-2">
                {renderReward({
                  id: choice.reward?.replace(/-\d+$/, '') || choice.id,
                  level: Number(choice.reward?.match(/-(\d+)$/)?.[1]) || 0,
                  name: choice.name,
                  quantity: choice.rewardQuantity || 1,
                  sprite: choice.sprite,
                  detail: '100%',
                  onInspect: () => inspectCatalog(choice.reward?.replace(/-\d+$/, '') || ''),
                })}
                <span className="flex items-center gap-1 text-sm text-amber-200" title={choice.currencyName}>
                  <SpriteIcon sprite={choice.currencySprite} size={24} />× {choice.required}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={exchangeRequired(choice.id, choice.level) + choice.required > (exchangeOwned[`${choice.id}@${choice.level}`] || 0)}
                  onClick={() => add(choice.key)}
                  className="ml-auto border-cyan-700"
                >
                  Add
                </Button>
              </div>
            ))}
            {selectedExchange.results.map((result, index) => (
              <div key={`${result.kind}-${result.id}-${index}`}>
                {renderReward({
                  id: result.id,
                  level: 0,
                  name: result.name,
                  quantity: result.quantity,
                  sprite: result.sprite,
                  kind: result.kind,
                  detail: `${Number((result.chance * 100).toFixed(6))}%`,
                  onInspect: () => {
                    // Nested exchange drill-down: a result that is itself a box/table pull opens its own rules.
                    const nested = exchangeable.find((choice) => !choice.reward && choice.id === result.id && !choice.level)
                    if (nested) setSelectedExchange(nested)
                    else if (!['gold', 'shells', 'cx', 'empty', 'open'].includes(result.kind)) inspectCatalog(result.id)
                  },
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {inspecting && (
        <Sheet open onOpenChange={(open) => !open && setInspecting(null)}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
            <ItemDetailBrowser
              rootItemId={inspecting.id}
              rootLevel={inspecting.level}
              catalog={state.merchantCatalog}
              monsters={state.bestiaryCatalog}
              context={{ character: 'Exchange catalog', slot: -1 }}
              exchangeAdd={
                inspecting.exchangeAdd && {
                  enabled: inspecting.exchangeAdd.enabled,
                  onAdd: () => {
                    inspecting.exchangeAdd!.onAdd()
                    setInspecting(null)
                  },
                }
              }
            />
          </SheetContent>
        </Sheet>
      )}
    </AccountScreenScaffold>
  )
}
