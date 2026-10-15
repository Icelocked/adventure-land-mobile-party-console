import { useState } from 'react'
import { useCharacters, usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { Chip } from '@/components/Chip'
import type { CharacterInventory, GearSet, GearSetItem, Item, PartyStateDynamic } from '@/models'

const SETS = [
  ['luck', 'Luck', 'Worn by the designated tank right before a kill'],
  ['tank', 'Tank', 'Restored after the kill'],
] as const

function member(item: Item | null | undefined, wanted: GearSetItem) {
  return (
    !!item &&
    item.name === wanted.name &&
    (item.level ?? undefined) === (wanted.level ?? undefined) &&
    (item.p ?? undefined) === (wanted.p ?? undefined) &&
    (item.stat_type ?? undefined) === (wanted.stat_type ?? undefined)
  )
}

/** Per slot: worn in that slot, carried in the bag (each copy counted once),
 *  or missing. Console: gear-set-control.tsx completeness(). */
function completeness(inventory: CharacterInventory, slots: Record<string, GearSetItem>) {
  const taken = new Set<number>()
  const missing: string[] = []
  let worn = 0
  let carried = 0
  for (const [slot, wanted] of Object.entries(slots)) {
    if (member(inventory.slots[slot]?.item, wanted)) {
      worn++
      continue
    }
    const index = inventory.items.findIndex((entry, i) => !taken.has(i) && member(entry?.item, wanted))
    if (index >= 0) {
      taken.add(index)
      carried++
    } else missing.push(slot)
  }
  return { total: Object.keys(slots).length, worn, carried, missing }
}

/** The console's "Gear sets (n)" popover as an inline group beside the
 *  Leader/Follow/Events chips. Saving captures the worn gear; the server
 *  refuses it (409) without a fresh equipment report. Console: gear-set-control.tsx. */
export function GearSetControl({ name, state }: { name: string; state: PartyStateDynamic }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const inventory = useCharacters()[name]?.inventory ?? null
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sets = state.gearSets?.[name]
  const saved = SETS.filter(([id]) => sets?.[id]).length
  const update = async (set: 'luck' | 'tank', action: 'save' | 'clear' | 'equip') => {
    setBusy(true)
    setError(null)
    const result = await api.gearSet(name, set, action)
    if (result.kind === 'failure') setError(result.message)
    else await refreshNow()
    setBusy(false)
  }
  return (
    <>
      <Chip selected={open} onClick={() => setOpen(!open)}>
        Gear sets ({saved}) ▾
      </Chip>
      {open && (
        <div role="group" aria-label="Gear sets" className="basis-full space-y-2 rounded border border-border bg-card p-3 text-xs">
          <p className="text-muted-foreground">
            Sets are saved from the gear {name} is wearing, every slot included. Equip wears a saved set from the bag (never the elixir) and pauses the tank&apos;s
            automatic return to its tank set for 10 minutes, so you can adjust and save again. Set members are never taken by automatic compound, upgrade or
            cleanout rules.
          </p>
          {SETS.map(([id, label, purpose]) => {
            const set: GearSet | undefined = sets?.[id]
            const pieces = set && inventory ? completeness(inventory, set.slots) : null
            return (
              <section key={id} aria-label={`${label} gear set`} className="space-y-1 rounded border border-border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-primary">{label}</span>
                  <span className="text-muted-foreground">{purpose}</span>
                </div>
                <p>
                  {!set
                    ? 'Not saved'
                    : !pieces
                      ? 'Loading inventory…'
                      : `${pieces.worn + pieces.carried}/${pieces.total} pieces available (${pieces.worn} worn, ${pieces.carried} in bag)` +
                        (pieces.missing.length ? ` · missing ${pieces.missing.join(', ')}` : '')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => void update(id, 'save')} className="rounded border border-emerald-600 px-2 py-1 text-emerald-100 disabled:opacity-50">
                    Save current gear as {label}
                  </button>
                  {set && (
                    <button type="button" disabled={busy} onClick={() => void update(id, 'equip')} className="rounded border border-sky-600 px-2 py-1 text-sky-100 disabled:opacity-50">
                      Equip {label}
                    </button>
                  )}
                  {set && (
                    <button type="button" disabled={busy} onClick={() => void update(id, 'clear')} className="rounded border border-rose-700 px-2 py-1 text-rose-200 disabled:opacity-50">
                      Clear
                    </button>
                  )}
                </div>
              </section>
            )
          })}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </>
  )
}
