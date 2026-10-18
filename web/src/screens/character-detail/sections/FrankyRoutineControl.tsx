import { useState } from 'react'
import { usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { Input } from '@/components/ui/input'
import { resolveEncounterRoutine, type PartyStateDynamic } from '@/models'

const frankyModes = [
  { id: 'auto', label: 'Auto', description: 'Try Tank first; switch to Off-tank for good after too many deaths (below)', color: 'border-cyan-600 bg-cyan-950 text-cyan-100' },
  { id: 'offtank', label: 'Off-tank', description: 'Stack on whoever else has aggro; leave the room if Franky targets you', color: 'border-emerald-600 bg-emerald-950 text-emerald-100' },
  { id: 'tank', label: 'Tank', description: 'Engage Franky directly and hold at weapon range, like normal combat', color: 'border-amber-600 bg-amber-950 text-amber-100' },
] as const

/** The console's Franky routine dialog as an inline group under the events
 *  list. A follower shows its leader's routine read-only; the server
 *  refuses its edits with 409 "following leader settings" (http/farming-scope.ts).
 *  Console: franky-dialog.tsx. */
export function FrankyRoutineControl({ name, state }: { name: string; state: PartyStateDynamic }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const routine = resolveEncounterRoutine(state, name)
  const inherited = !!routine.followingLeader
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [limitDraft, setLimitDraft] = useState(String(routine.autoDeathLimit))
  const [limitBusy, setLimitBusy] = useState(false)
  const [limitError, setLimitError] = useState<string | null>(null)
  // A saved limit replaces the draft, as the console's dialog does on each new limit.
  const [shownLimit, setShownLimit] = useState(routine.autoDeathLimit)
  if (shownLimit !== routine.autoDeathLimit) {
    setShownLimit(routine.autoDeathLimit)
    setLimitDraft(String(routine.autoDeathLimit))
  }

  const select = async (mode: (typeof frankyModes)[number]['id']) => {
    setBusy(mode)
    setError(null)
    const result = await api.setEncounterMode(name, 'franky', mode)
    if (result.kind === 'failure') setError(result.message || 'Could not save franky routine')
    else await refreshNow()
    setBusy(null)
  }
  const saveLimit = async () => {
    const value = Math.round(Number(limitDraft))
    if (!Number.isFinite(value) || value < 0) {
      setLimitError('Enter 0 or a positive number of deaths.')
      return
    }
    setLimitBusy(true)
    setLimitError(null)
    const result = await api.setEncounterAutoLimit(name, 'franky', value)
    if (result.kind === 'failure') setLimitError(result.message || 'Could not save the death limit')
    else await refreshNow()
    setLimitBusy(false)
  }

  return (
    <div role="group" aria-label="Franky routine" className="mt-2 space-y-2 rounded border border-amber-800 p-3">
      <p className="text-sm font-semibold text-amber-200">Franky routine · {name}</p>
      <p className="text-muted-foreground">Choose how this character reacts to Franky&apos;s aggro once it&apos;s live.</p>
      {inherited && <p className="text-cyan-100">Inherited from the leader.</p>}
      <div className="flex flex-col gap-2">
        {frankyModes.map((entry) => (
          <button
            key={entry.id}
            type="button"
            disabled={inherited || busy !== null}
            aria-pressed={routine.mode === entry.id}
            onClick={() => void select(entry.id)}
            className={`rounded border px-3 py-2 text-left disabled:opacity-50 ${entry.color} ${routine.mode === entry.id ? 'ring-2 ring-white/70' : 'opacity-80'}`}
          >
            <span className="block font-mono uppercase">{busy === entry.id ? 'Saving…' : entry.label}</span>
            <span className="mt-0.5 block opacity-90">{entry.description}</span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="rounded border border-border p-3">
        <p className="text-muted-foreground">
          In Auto mode, this character tries Tank first. After this many deaths to Franky while auto-tanking, Auto switches to Off-tank for good. Set to 0 to skip Tank entirely in Auto mode. Raising the
          limit later lets it try Tank again.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            aria-label="Auto-tank death limit"
            type="number"
            min={0}
            step={1}
            value={limitDraft}
            disabled={inherited || limitBusy}
            onChange={(event) => setLimitDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void saveLimit()
            }}
            className="w-24"
          />
          <button type="button" disabled={inherited || limitBusy} onClick={() => void saveLimit()} className="rounded border border-border px-3 py-1.5 disabled:opacity-50">
            {limitBusy ? 'Saving…' : 'Set'}
          </button>
          <span className="text-amber-200">
            Deaths while auto-tanking: {routine.autoDeaths}
            {routine.autoDeathLimit > 0 ? `/${routine.autoDeathLimit}` : ''}
          </span>
        </div>
        {limitError && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {limitError}
          </p>
        )}
      </div>
    </div>
  )
}
