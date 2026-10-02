import { useState } from 'react'
import { PackageOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SpriteIcon } from '@/components/SpriteIcon'
import { npcSaleValue } from '@/lib/itemFormulas'
import { deconstructionRewards } from '@/models'
import type { CatalogItem, DeconstructionCatalog, Item, ItemMeta } from '@/models'

/** deconstruction-confirmation.tsx, inline: the rewards per item (each row a
 *  separate roll), cost per item, and a confirm that only sends once the
 *  reward data exists. */
export function DeconstructionConfirmation({
  item,
  auto,
  all = false,
  catalog,
  catalogFor,
  onConfirm,
  onCancel,
}: {
  item: Item
  auto: boolean
  all?: boolean
  catalog: DeconstructionCatalog
  catalogFor: (id: string) => CatalogItem | undefined
  onConfirm: () => Promise<string | null>
  onCancel: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rewards = deconstructionRewards(item, catalog)
  const title = auto ? 'Enable auto deconstruction?' : all ? 'Mark all for deconstruction?' : 'Mark for deconstruction?'
  const confirm = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const failure = await onConfirm()
    setBusy(false)
    if (failure) setError(failure || 'Could not mark for deconstruction')
  }
  return (
    <div role="group" aria-label={title} className="my-1.5 flex flex-col gap-2 rounded-md border border-orange-700/60 bg-orange-950/20 p-2.5 pl-4">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">
        {auto
          ? 'The merchant will deconstruct matching items at this level, stat type, and special property until you remove the rule.'
          : `The merchant will deconstruct ${all ? 'all eligible bank copies of' : `${item.q || 1} ×`} ${catalogFor(item.name)?.name || item.name}${item.level ? ` +${item.level}` : ''}. This consumes the original items.`}
      </p>
      <p className="text-sm font-semibold text-orange-400">Possible rewards per item</p>
      {rewards?.map((reward, index) => {
        const definition = catalogFor(reward.name)
        return (
          <div key={`${reward.name}:${index}`} className="flex items-center gap-3 rounded border border-border p-2">
            <span className="relative grid h-10 w-10 shrink-0 place-items-center border border-border">
              {definition?.sprite ? <SpriteIcon sprite={definition.sprite} size={40} /> : <PackageOpen className="h-5 w-5 text-muted-foreground" />}
              {reward.level ? <span className="absolute bottom-0 right-0 bg-black px-1 text-xs text-amber-200">+{reward.level}</span> : null}
            </span>
            <span className="min-w-0 flex-1 text-sm">
              {reward.quantity} × {definition?.name || reward.name}
              {reward.level ? ` +${reward.level}` : ''}
            </span>
            <span className="font-mono text-sm font-semibold text-orange-400">{Number((reward.chance * 100).toFixed(4))}%</span>
          </div>
        )
      })}
      {!rewards ? <p className="text-sm text-amber-500">Reward data is unavailable. Refresh after the coordinator updates.</p> : null}
      {rewards && rewards.length > 1 ? <p className="text-xs text-muted-foreground">Each reward row is a separate roll. Percentages are per item deconstructed.</p> : null}
      {catalog[item.name]?.cost !== undefined ? <p className="text-sm text-amber-500">Cost per item: {catalog[item.name].cost!.toLocaleString()}g</p> : null}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !rewards} className="bg-orange-600 text-white hover:bg-orange-500" onClick={() => void confirm()}>
          {busy ? 'Saving…' : auto ? 'Enable auto deconstruction' : all ? 'Mark all for deconstruction' : 'Mark for deconstruction'}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/** party-management-panels.tsx "Automatically sell to NPC?": what the rule
 *  matches, its scope, and the proceeds per sale. */
export function AutoNpcSaleConfirmation({
  item,
  meta,
  name,
  character,
  onConfirm,
  onCancel,
}: {
  item: Item
  meta: ItemMeta | undefined
  name: string
  character?: string
  onConfirm: () => Promise<string | null>
  onCancel: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div role="group" aria-label="Automatically sell to NPC?" className="my-1.5 flex flex-col gap-2 rounded-md border border-orange-700/60 bg-orange-950/20 p-2.5 pl-4">
      <p className="text-sm font-medium">Automatically sell to NPC?</p>
      <p className="text-xs text-muted-foreground">
        {character
          ? `Matching items on ${character} will be collected and sold by the merchant. This`
          : 'Every future matching item received by the merchant will be queued for NPC sale. This'}{' '}
        remains active until you clear the rule.
      </p>
      <div className="rounded border border-orange-900 p-2.5">
        <p className="font-semibold">
          {name}
          {item.level ? ` +${item.level}` : ''}
        </p>
        <p className="mt-1 font-mono text-sm text-amber-500">You will receive {npcSaleValue(item.level ?? 0, !!item.gift, item.expires, meta).toLocaleString()}g per sale.</p>
        <p className="mt-1 text-xs text-muted-foreground">The rule matches this exact +level, stat type, and special property.</p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy}
          className="bg-orange-500 text-black hover:bg-orange-400"
          onClick={async () => {
            setBusy(true)
            setError(null)
            const failure = await onConfirm()
            setBusy(false)
            if (failure) setError(failure || 'Automatic NPC sale failed')
          }}
        >
          Enable auto sale
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
