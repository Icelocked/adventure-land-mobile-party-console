import { useState } from 'react'
import { useConfigLoaded, usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { Chip } from '@/components/Chip'

/** The party's designated tank, picked from the connected characters.
 *  Sends POST /party-api/formation {tank}, with null for None. The
 *  console's select becomes a chip that opens the choices inline, so the
 *  names stay out of the party list until asked for.
 *  Console: party-roles-settings.tsx. */
export function PartyRolesSettings({ tank, characters }: { tank: string | null; characters: string[] }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const configLoaded = useConfigLoaded()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const choose = async (name: string | null) => {
    setOpen(false)
    // The console's select fires only on a change.
    if (name === tank) return
    setError(null)
    const result = await api.setDesignatedTank(name)
    if (result.kind === 'failure') setError(result.message || 'Formation update failed')
    await refreshNow()
  }
  return (
    <div className="mx-3 mt-3 rounded-lg border border-border bg-card p-3 text-sm">
      <Chip selected={open} disabled={!configLoaded} onClick={() => setOpen(!open)}>
        Tank: {tank || 'None'} ▾
      </Chip>
      {open && (
        <div role="group" aria-label="Tank" className="mt-2 flex flex-wrap gap-2">
          {[null, ...characters].map((name) => (
            <Chip key={name ?? ''} selected={name === tank} onClick={() => void choose(name)}>
              {name ?? 'None'}
            </Chip>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">
        Holds melee range for the party regardless of class, owns taunt/absorb aggro-pulling, and swaps into its highest-luck available gear right before a kill.
      </p>
      {error && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
