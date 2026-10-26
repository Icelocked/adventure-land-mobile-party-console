import { useState } from 'react'
import { useConfigLoaded, usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { Chip } from '@/components/Chip'
import type { FormationRoles } from '@/api/partyApi'

// Console party-roles-settings.tsx hints.
const TANK_HINT = 'The tank holds its target at its own range and owns taunt and absorb.'
const OFF_TANK_HINT = "The off tank takes the tank's attackers while the tank is in danger and hands them back once it recovers."
const PULL_HINT = 'With Pull on, the party waits outside the pack and its longest-range member draws one monster at a time.'

function RolePicker({ label, hint, value, characters, disabled, onSelect }: {
  label: string
  hint: string
  value: string | null
  characters: string[]
  disabled: boolean
  onSelect: (name: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <Chip selected={open} disabled={disabled} onClick={() => setOpen(!open)}>
        {label}: {value || 'None'} ▾
      </Chip>
      {open && (
        <div role="group" aria-label={label} className="mt-2 flex flex-wrap gap-2">
          {[null, ...characters].map((name) => (
            <Chip
              key={name ?? ''}
              selected={name === value}
              onClick={() => {
                setOpen(false)
                // The console's select fires only on a change.
                if (name !== value) onSelect(name)
              }}
            >
              {name ?? 'None'}
            </Chip>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

/** The party-wide tank, off tank and pull mode. Every character's Farming
 *  settings shows the same values, and each change sends POST
 *  /party-api/formation with only the changed field ({tank}, {offTank} or
 *  {pullMode}); null clears a role. The console's selects become chips
 *  that open the choices inline. With `pull` false (a console without off
 *  tank and pull mode) only the tank shows.
 *  Console: party-roles-settings.tsx in farming-mode-control.tsx. */
export function PartyRolesSettings({ tank, offTank, pullMode, pull, characters }: {
  tank: string | null
  offTank: string | null
  pullMode: boolean
  pull: boolean
  characters: string[]
}) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const configLoaded = useConfigLoaded()
  const [error, setError] = useState<string | null>(null)
  const formation = async (body: FormationRoles) => {
    setError(null)
    const result = await api.setFormationRoles(body)
    if (result.kind === 'failure') setError(result.message || 'Formation update failed')
    await refreshNow()
  }
  return (
    <fieldset aria-label="Party roles" className="mx-3 mt-3 flex flex-col gap-3 rounded-lg border border-border bg-card p-3 text-sm">
      <RolePicker label="Tank" hint={TANK_HINT} value={tank} characters={characters} disabled={!configLoaded} onSelect={(next) => void formation({ tank: next })} />
      {pull && (
        <>
          <RolePicker label="Off tank" hint={OFF_TANK_HINT} value={offTank} characters={characters} disabled={!configLoaded} onSelect={(next) => void formation({ offTank: next })} />
          <div>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4" checked={pullMode} disabled={!configLoaded} onChange={(event) => void formation({ pullMode: event.target.checked })} />
              Pull
            </label>
            <p className="mt-1.5 text-xs text-muted-foreground">{PULL_HINT}</p>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  )
}
