import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { useCharacters, usePartyApi, useRefreshDynamicStateNow, useConfigLoaded } from '@/data/PartyDataProvider'
import { eventDisplayNames, eventPolicy, eventPriorityOrder, eventTimeLabel, selectedEvents, supportedEvents, type EventSchedule } from '@/lib/eventPolicy'
import { useClock } from '@/lib/duration'
import { CaveEventRow } from '@/screens/dungeon/CaveEventRow'
import { ConfigLoadingNote } from '@/components/ConfigLoadingNote'
import { Chip } from '@/components/Chip'
import { SectionCard } from '../SectionCard'
import { GearSetControl } from './GearSetControl'
import { FrankyRoutineControl } from './FrankyRoutineControl'
import type { PartyStateDynamic } from '@/models'

/** Two independent tap targets on POST /party-api/formation. "Leader" sends
 *  only {leader} (a radio: tapping the current leader does nothing);
 *  "Follow" sends only {character, follow}. */
export function LeaderFollowerSection({ characterName, dynamicState }: { characterName: string; dynamicState: PartyStateDynamic }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const configLoaded = useConfigLoaded()
  const isLeader = dynamicState.leader === characterName
  const isFollowing = dynamicState.followers[characterName] === true
  const [formationError, setFormationError] = useState<string | null>(null)
  // Merchant-class characters get neither gear sets nor a Franky routine (connected-character-card.tsx).
  const combat = useCharacters()[characterName]?.vitals?.ctype !== 'merchant'

  return (
    <SectionCard title="Formation">
      <div className="flex flex-wrap gap-3">
        <Chip
          selected={isLeader}
          disabled={!configLoaded}
          onClick={async () => {
            if (isLeader) return
            setFormationError(null)
            const result = await api.setLeader(characterName)
            if (result.kind === 'failure') setFormationError(result.message || 'Formation update failed')
            await refreshNow()
          }}
        >
          Leader
        </Chip>
        <Chip
          selected={isFollowing}
          disabled={!configLoaded}
          onClick={async () => {
            setFormationError(null)
            const result = await api.setFollow(characterName, !isFollowing)
            if (result.kind === 'failure') setFormationError(result.message || 'Formation update failed')
            await refreshNow()
          }}
        >
          Follow
        </Chip>
        <EventSelectionControl state={dynamicState} name={characterName} combat={combat} />
        {combat && <GearSetControl name={characterName} state={dynamicState} />}
      </div>
      <ConfigLoadingNote />
      {formationError && (
        <p role="alert" className="mt-1.5 text-sm text-destructive">
          {formationError}
        </p>
      )}
      {!isLeader && dynamicState.leader && <p className="mt-1.5 text-xs text-muted-foreground">Following {dynamicState.leader}</p>}
    </SectionCard>
  )
}

/** The "Events (n)" selection as an inline list. Followers use their leader's events (the server 409s for them). */
function EventSelectionControl({ state, name, combat }: { state: PartyStateDynamic; name: string; combat: boolean }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const navigate = useNavigate()
  const now = useClock()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [franky, setFranky] = useState(false)
  const policy = eventPolicy(state, name)
  const selected = selectedEvents(state, name)
  const catalog: EventSchedule[] = state.eventSchedules?.length ? state.eventSchedules : supportedEvents.map((id) => ({ id, name: eventDisplayNames[id] ?? id }))
  // Events list in the character's priority order, as on the console; unsupported ones last.
  const order = eventPriorityOrder(state, name)
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length)
  const onChange = async (events: string[]) => {
    setError(null)
    const result = await api.setEventSelections(name, events)
    if (result.kind === 'failure') setError(result.message)
    else await refreshNow()
  }
  return (
    <>
      <Chip selected={open} onClick={() => setOpen(!open)}>
        Events ({selected.length}) ▾
      </Chip>
      {open && (
        <div role="group" aria-label="Events" className="basis-full rounded border border-border bg-card p-3 text-xs">
          {policy.inherited && <p className="mb-2 text-amber-200">Using {policy.source}’s events</p>}
          <CaveEventRow />
          {[...catalog]
            .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name))
            .map((event) => {
              const supported = supportedEvents.includes(event.id)
              const allowed = supported
              return (
                <div key={event.id} className="flex items-center gap-2 py-2">
                  <input
                    type="checkbox"
                    aria-label={event.name}
                    checked={allowed && selected.includes(event.id)}
                    disabled={!allowed || policy.inherited}
                    className="accent-emerald-500"
                    onChange={(e) => void onChange(e.target.checked ? [...selected, event.id] : selected.filter((id) => id !== event.id))}
                  />
                  <span>
                    {event.name} —{' '}
                    {!supported ? 'Unsupported' : event.live ? 'LIVE' : event.next ? eventTimeLabel(event.next, now) : event.slotAt ? `Next chance: ${eventTimeLabel(event.slotAt, now)}` : 'Time not announced'}
                    {event.stale ? ' · timing stale' : ''}
                  </span>
                  {event.id === 'anniversary' && (
                    <button type="button" aria-label="Anniversary settings" onClick={() => navigate('/anniversary')} className="ml-auto rounded border border-border p-2 text-pink-200">
                      <Settings className="size-4" />
                    </button>
                  )}
                  {event.id === 'franky' && combat && (
                    <button type="button" aria-label="Franky routine settings" aria-expanded={franky} onClick={() => setFranky(!franky)} className="ml-auto rounded border border-border p-2 text-amber-200">
                      <Settings className="size-4" />
                    </button>
                  )}
                </div>
              )
            })}
          {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
          {franky && combat && <FrankyRoutineControl name={name} state={state} />}
        </div>
      )}
    </>
  )
}
