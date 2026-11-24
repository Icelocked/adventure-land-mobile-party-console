import { useState } from 'react'
import { useCharacterDiagnostics, useCharacters } from '@/data/PartyDataProvider'
import { useAddonEnabled, useAddons, useAddonWrites } from '@/data/useAddons'

// Tank Hold's line in a character's Farming card (console runtime/addons/tank-hold/dashboard.tsx,
// the `card-section` slot's `farming-line` part): the tank, off tank and puller pickers and the
// Pull switch, then what this character does. The picks save to the store of the farming scope the
// character plays in, so every card of one scope shows and changes the same picks.

const NAME = 'tank-hold'
const PICKERS = [
  ['tank', 'Tank'],
  ['offTank', 'Off tank'],
  ['puller', 'Puller'],
] as const
const named = (value: unknown) => (typeof value === 'string' && value ? value : '')

export function TankHoldLine({ character, scope }: { character: string; scope?: string }) {
  const enabled = useAddonEnabled(NAME)
  const { stores } = useAddons()
  const writes = useAddonWrites()
  const members = Object.keys(useCharacters()).sort()
  const report = (useCharacterDiagnostics(character)?.addonReports?.[NAME] ?? {}) as { role?: unknown; line?: unknown }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!enabled) return null
  const picks = scope ? stores[NAME]?.[`scope:${scope}`] : undefined
  const write = (patch: Record<string, unknown>) => {
    if (!scope) return
    setBusy(true)
    setError('')
    writes
      .store(NAME, `scope:${scope}`, patch)
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure)))
      .finally(() => setBusy(false))
  }
  // A card with no farming scope has no scope store to save to; its line stays read only.
  const disabled = busy || !scope
  return (
    <div data-addon={NAME} className="mb-1.5 font-mono text-[10px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 uppercase">
        {PICKERS.map(([key, label]) => (
          <label key={key} className="flex items-center gap-1">
            <span className="text-muted-foreground">{label}</span>
            <select
              aria-label={`Tank Hold ${label}`}
              value={named(picks?.[key])}
              disabled={disabled}
              onChange={(event) => write({ [key]: event.target.value || null })}
              className="h-7 rounded border border-border bg-background px-1 text-xs normal-case"
            >
              <option value="">{key === 'puller' ? 'The tank' : 'None'}</option>
              {members.map((member) => (
                <option key={member} value={member}>
                  {member}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="flex items-center gap-1">
          <span className="text-muted-foreground">Pull</span>
          <input type="checkbox" aria-label="Tank Hold Pull" className="size-4" checked={picks?.pull === true} disabled={disabled} onChange={(event) => write({ pull: event.target.checked })} />
        </label>
      </div>
      {error && <p className="mt-1 text-rose-300">{error}</p>}
      {typeof report.role === 'string' && report.role && (
        <p className="mt-1 text-cyan-200">
          {report.role}
          {typeof report.line === 'string' && report.line ? ` · ${report.line}` : ''}
        </p>
      )}
    </div>
  )
}
