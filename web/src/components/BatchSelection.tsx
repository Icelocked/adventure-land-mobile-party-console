import { useState, type ReactNode } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { TapRow } from '@/screens/itempanel/ItemActionPanel'
import { usePartyApi, useRefreshDynamicStateNow, useDynamicState } from '@/data/PartyDataProvider'
import { batchActions, ExchangeSelectionContext, rewardBatchHandlers, useExchangeSelection, useExchangeSelectionState, type BatchEntry, type BatchHandlers, type BatchSelection } from '@/lib/batchSelection'

// The batch select controls; lib/batchSelection.ts holds the selection and the row rules.

type Run = (entry: BatchEntry) => Promise<string | null>

/** The select mode's bar: the count, the batch actions list and Done. Each action sends one request
 *  per item in order and stops at the first refusal, as BatchItemActions `each` does. */
export function BatchSelectionBar({ selection, entries, handlers, onDone }: { selection: BatchSelection; entries: BatchEntry[]; handlers: BatchHandlers; onDone: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!selection.active) return null
  const chosen = selection.of(entries)
  const rows = batchActions(chosen, handlers)
  const run = async (action: Run) => {
    setBusy(true)
    setError(null)
    for (const entry of chosen) {
      const failure = await action(entry)
      if (failure) {
        setError(failure)
        break
      }
    }
    setBusy(false)
    await onDone()
    setOpen(false)
  }
  return (
    <div role="group" aria-label="Selected items" className="mb-2 flex items-center gap-2 rounded-md border border-sky-700 bg-sky-950/30 p-2 text-sm">
      <span className="flex-1">{chosen.length} selected items</span>
      <Button size="sm" variant="outline" disabled={chosen.length < 2} onClick={() => setOpen(true)}>
        Actions
      </Button>
      <Button size="sm" variant="outline" onClick={selection.stop}>
        Done
      </Button>
      {error && !open && (
        <p role="alert" className="basis-full text-destructive">
          {error}
        </p>
      )}
      {open && (
        <Sheet open onOpenChange={(value) => !value && setOpen(false)}>
          <SheetContent side="bottom" aria-label="Batch actions" className="max-h-[85vh] overflow-y-auto p-4">
            <div className="pb-1 pt-1 text-sm text-muted-foreground">{chosen.length} selected items</div>
            <div className="my-2 border-t border-border" />
            {error && (
              <p role="alert" className="py-1 text-sm text-destructive">
                {error}
              </p>
            )}
            {rows.map((row) => (
              <TapRow key={row.label} label={row.label} disabled={busy} onClick={() => void run(row.run)} />
            ))}
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}

/** The Select button that turns select mode on. */
export function SelectButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-md border border-border px-2 py-1 text-xs font-normal text-muted-foreground ${className}`}>
      Select
    </button>
  )
}

/** exchange-item-selection.tsx ExchangeItemSelection: one shared selection for a view's reward tiles. */
export function ExchangeSelectionProvider({ children }: { children: ReactNode }) {
  const value = useExchangeSelectionState()
  return <ExchangeSelectionContext.Provider value={value}>{children}</ExchangeSelectionContext.Provider>
}

/** The reward view's Select button. The batch rows need a merchant and two registered rewards. */
export function ExchangeSelectButton() {
  const context = useExchangeSelection()
  const state = useDynamicState()
  if (!context || !state.merchantCharacter || context.selection.active || context.entries.length < 2) return null
  return <SelectButton onClick={context.selection.start} />
}

/** The reward view's batch bar, shown in select mode. */
export function ExchangeSelectionBar() {
  const context = useExchangeSelection()
  const state = useDynamicState()
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  if (!context || !state.merchantCharacter) return null
  return <BatchSelectionBar selection={context.selection} entries={context.entries} handlers={rewardBatchHandlers(api, state)} onDone={refreshNow} />
}
