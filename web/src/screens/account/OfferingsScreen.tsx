import { useState } from 'react'
import { useDynamicState, usePartyApi, useRefreshDynamicStateNow, useCharacters } from '@/data/PartyDataProvider'
import { itemMaximumLevel } from '@/lib/itemFormulas'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Chip } from '@/components/Chip'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'
import { UPGRADE_OFFERING_LABELS } from '@/models'
import type { CatalogItem, UpgradeOffering, UpgradeOfferingRule } from '@/models'

/** upgrade-offering-controls.tsx's rule list ("Upgrade rules" accordion
 *  under the inventory panel) ported as its own screen - "use a Primling/
 *  Primordial Essence/Primordial X instead of scrolls" during AUTOMATIC
 *  upgrades within a level range, entirely missing from both clients
 *  before this (the tier picker built earlier this session only covers
 *  manual scroll-tier marking, not this rule-based offering system). The
 *  dashboard's MANUAL "use an offering on this one item right now" path
 *  (from the inventory context menu) is not ported - it needs live
 *  offering-stock computation wired into the item action panel; the
 *  standing-rule system here is the actual account-wide automation this
 *  screen exists for. */
export function OfferingsScreen() {
  const dynamicState = useDynamicState()
  const characters = useCharacters()
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const [editing, setEditing] = useState<UpgradeOfferingRule | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const catalog = dynamicState.merchantCatalog?.allItems ?? []
  const catalogFor = (id: string): CatalogItem | undefined => catalog.find((c) => c.id === id)
  const merchant = Object.entries(characters).find(([, c]) => c.vitals?.ctype === 'merchant')?.[0]
  const rules = dynamicState.upgradeOfferingRules

  const remove = async (id: string) => {
    if (!merchant) return
    setError(null)
    const result = await api.removeOfferingRule(merchant, id)
    if (result.kind === 'failure') setError(result.message)
    else await refreshNow()
  }

  return (
    <AccountScreenScaffold title="Upgrade offering rules" onRefresh={() => void refreshNow()}>
      <p className="px-3 pb-2 text-xs text-muted-foreground">Uses a Primling/Primordial Essence/Primordial X instead of scrolls during automatic upgrades within a level range.</p>
      <div className="px-3 pb-2">
        <Button size="sm" onClick={() => setEditing('new')} disabled={!merchant}>
          Add rule
        </Button>
      </div>
      {error && <p className="px-3 pb-2 text-sm text-destructive">{error}</p>}

      {rules.length === 0 ? (
        <EmptyState message="No upgrade offering rules." />
      ) : (
        <div className="flex flex-col gap-1.5 px-3">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center gap-2.5 rounded-md border border-border bg-card p-2.5">
              <SpriteIcon sprite={catalogFor(rule.name)?.sprite} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{catalogFor(rule.name)?.name ?? rule.name}</div>
                <div className="text-xs text-muted-foreground">
                  +{rule.floor} → +{rule.ceiling} · {UPGRADE_OFFERING_LABELS[rule.offering]} · {rule.required ? 'Required' : 'When available'}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing(rule)}>
                Edit
              </Button>
              <Button size="sm" variant="destructive" onClick={() => void remove(rule.id)}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {editing && merchant && (
        <RuleForm
          rule={editing === 'new' ? null : editing}
          catalog={catalog}
          merchant={merchant}
          onClose={() => setEditing(null)}
        />
      )}
    </AccountScreenScaffold>
  )
}

function RuleForm({ rule, catalog, merchant, onClose }: { rule: UpgradeOfferingRule | null; catalog: CatalogItem[]; merchant: string; onClose: () => void }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const [itemId, setItemId] = useState(rule?.name ?? '')
  const [search, setSearch] = useState('')
  const [floor, setFloor] = useState(rule?.floor ?? 0)
  const [ceiling, setCeiling] = useState(rule?.ceiling ?? 1)
  const [offering, setOffering] = useState<UpgradeOffering>(rule?.offering ?? 'offeringp')
  const [required, setRequired] = useState(rule?.required ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedCatalogItem = catalog.find((c) => c.id === itemId)
  const max = itemMaximumLevel(selectedCatalogItem?.meta ?? undefined)
  const upgradeable = catalog.filter((c) => c.upgradeable && c.name.toLowerCase().includes(search.toLowerCase())).slice(0, 100)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border p-3">
        <span className="text-sm font-medium">{rule ? 'Edit upgrade rule' : 'Add upgrade rule'}</span>
        <button className="text-sm text-muted-foreground" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {!rule && (
          <>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search upgradeable items..." className="mb-2" />
            <div className="mb-3 max-h-40 overflow-y-auto rounded-md border border-border">
              {upgradeable.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setItemId(item.id)
                    setFloor(0)
                    setCeiling(Math.min(1, itemMaximumLevel(item.meta ?? undefined)))
                  }}
                  className={`flex w-full items-center gap-2 p-2 text-left text-sm hover:bg-accent ${itemId === item.id ? 'bg-accent' : ''}`}
                >
                  <SpriteIcon sprite={item.sprite} size={24} />
                  {item.name}
                </button>
              ))}
            </div>
          </>
        )}
        {selectedCatalogItem && (
          <div className="mb-3 flex items-center gap-2">
            <SpriteIcon sprite={selectedCatalogItem.sprite} size={32} />
            <span className="text-sm font-medium">{selectedCatalogItem.name}</span>
          </div>
        )}
        {itemId && (
          <>
            <div className="mb-3 flex items-center gap-2 text-sm">
              <span>When upgrading from</span>
              <select
                aria-label="Starting level"
                value={floor}
                onChange={(e) => setFloor(Number(e.target.value))}
                className="rounded-md border border-border bg-background px-2 py-1"
              >
                {Array.from({ length: max }, (_, n) => n).map((n) => (
                  <option key={n} value={n}>
                    +{n}
                  </option>
                ))}
              </select>
              <span>to</span>
              <select
                aria-label="Ending level"
                value={ceiling}
                onChange={(e) => setCeiling(Number(e.target.value))}
                className="rounded-md border border-border bg-background px-2 py-1"
              >
                {Array.from({ length: max }, (_, n) => n + 1).map((n) => (
                  <option key={n} value={n} disabled={n <= floor}>
                    +{n}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(Object.entries(UPGRADE_OFFERING_LABELS) as [UpgradeOffering, string][]).map(([id, label]) => (
                <Chip key={id} selected={offering === id} onClick={() => setOffering(id)}>
                  {label}
                </Chip>
              ))}
            </div>
            <div className="mb-3 flex flex-col gap-1.5 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={required} onChange={() => setRequired(true)} />
                Required to attempt upgrade
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={!required} onChange={() => setRequired(false)} />
                Only if item is available
              </label>
            </div>
          </>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <div className="border-t border-border p-3">
        <Button
          className="w-full"
          disabled={saving || !itemId || floor >= ceiling}
          onClick={async () => {
            setSaving(true)
            setError(null)
            const result = await api.saveOfferingRule(merchant, rule?.id ?? '', itemId, floor, ceiling, offering, required)
            setSaving(false)
            if (result.kind === 'failure') setError(result.message)
            else {
              await refreshNow()
              onClose()
            }
          }}
        >
          {saving ? 'Saving...' : 'Confirm'}
        </Button>
      </div>
    </div>
  )
}
