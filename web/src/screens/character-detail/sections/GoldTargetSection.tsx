import { useEffect, useRef, useState } from 'react'
import { Coins, Landmark } from 'lucide-react'
import { abbreviatedGold } from '@/lib/gold'
import { usePartyApi, useRefreshDynamicStateNow, useConfigLoaded } from '@/data/PartyDataProvider'
import { ConfigLoadingNote } from '@/components/ConfigLoadingNote'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '../SectionCard'

/** gold-target-control.tsx (the merchant's character card): current gold,
 *  the gold target the merchant keeps on hand ("gold-target", saved when the
 *  field loses focus) and "Exchange gold and items with bank" - which saves
 *  the target first, then queues a bank run. Gold otherwise moves only
 *  during the merchant's normal bank errands. */
export function GoldTargetSection({ characterName, serverTarget, gold }: { characterName: string; serverTarget: number; gold: number }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const configLoaded = useConfigLoaded()
  const editing = useRef(false)
  const [draft, setDraft] = useState(String(serverTarget))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!editing.current) setDraft(String(serverTarget))
  }, [serverTarget])

  const parsed = () => {
    const amount = Number(draft)
    return Number.isSafeInteger(amount) && amount >= 0 ? amount : null
  }
  // gold-target-control.tsx save(): only a valid amount is sent.
  const save = async () => {
    const amount = parsed()
    if (amount === null) return null
    const result = await api.sendCommand(characterName, { type: 'gold-target', amount })
    return result.kind === 'failure' ? result.message || 'Command failed' : null
  }

  return (
    <SectionCard title="Merchant's pocket money">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-sm text-amber-300" title={`${gold.toLocaleString()} gold`}>
          <Coins className="size-4" />
          {abbreviatedGold(gold)}
        </span>
        <Input
          aria-label="Merchant's pocket money"
          inputMode="numeric"
          placeholder="Set target amount"
          value={draft}
          disabled={!configLoaded}
          onFocus={() => {
            editing.current = true
          }}
          onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ''))}
          onBlur={async () => {
            editing.current = false
            setError(await save())
            await refreshNow()
          }}
          className="h-8 min-w-0 flex-1 font-mono text-xs"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-2"
        disabled={!configLoaded || busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          const failed = await save()
          const banked = failed ? null : await api.sendCommand(characterName, { type: 'bank' })
          setError(failed ?? (banked?.kind === 'failure' ? banked.message || 'Command failed' : null))
          await refreshNow()
          setBusy(false)
        }}
      >
        <Landmark className="size-4" />
        Exchange gold and items with bank
      </Button>
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      )}
      <ConfigLoadingNote />
    </SectionCard>
  )
}
