import { useState } from 'react'
import { useSectionOpen } from '@/lib/sectionOpen'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { usePartyApi, useDomainInterest, useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'

const COLORS: Record<string, string> = {
  skill: 'text-cyan-400',
  kill: 'text-rose-400',
  loot: 'text-amber-500',
  death: 'text-red-500',
  item: 'text-emerald-400',
}

/** A collapsed "Combat log" that,
 *  while open, keeps the logs domain fresh and lists the last 50 events
 *  (newest first, coloured by type) with Clear history. */
export function CombatLogSection({ characterName }: { characterName: string }) {
  const [open, setOpen] = useSectionOpen('character:Combat log', false)
  return (
    <section aria-label="Combat log" className="mx-3 my-1.5 rounded-lg border border-border bg-card p-4">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-1 text-left text-sm font-semibold">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Combat log
      </button>
      {open && <LogContents characterName={characterName} />}
    </section>
  )
}

function LogContents({ characterName }: { characterName: string }) {
  useDomainInterest('logs')
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const entries = useDynamicState().combatLogs[characterName] ?? []
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase text-muted-foreground">
        <span>{entries.length} events</span>
        {entries.length ? (
          <button
            type="button"
            className="text-rose-400"
            onClick={async () => {
              setError(null)
              const result = await api.clearCombatLog(characterName)
              if (result.kind === 'failure') setError(result.message)
              await refreshNow()
            }}
          >
            Clear history
          </button>
        ) : null}
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="mt-1 max-h-48 space-y-1 overflow-y-auto font-mono text-[10px]">
        {entries.length ? (
          entries
            .slice(-50)
            .reverse()
            .map((entry, index) => (
              <p key={`${entry.at}-${index}`} className="flex gap-2 text-muted-foreground">
                <span className="shrink-0 opacity-60">{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <span className={(entry.type && COLORS[entry.type]) || undefined}>{entry.message}</span>
              </p>
            ))
        ) : (
          <p className="text-muted-foreground">No combat events yet</p>
        )}
      </div>
    </div>
  )
}
