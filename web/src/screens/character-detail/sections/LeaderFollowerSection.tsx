import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, Settings } from 'lucide-react'
import { usePartyApi, useRefreshDynamicStateNow, useConfigLoaded } from '@/data/PartyDataProvider'
import {
  eventDisplayNames,
  eventLimits,
  eventPolicy,
  eventPriorityOrder,
  eventTimeLabel,
  selectedEvents,
  supportedEvents,
  validEventLimits,
  type EventLimits,
  type EventSchedule,
} from '@/lib/eventPolicy'
import { useClock } from '@/lib/duration'
import { CaveEventRow } from '@/screens/dungeon/CaveEventRow'
import { ConfigLoadingNote } from '@/components/ConfigLoadingNote'
import { Chip } from '@/components/Chip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '../SectionCard'
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
        <EventSelectionControl state={dynamicState} name={characterName} />
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

/** The "Events (n)" selection as an inline list (console 1.4
 *  event-selection-control.tsx). Followers use their leader's events (the
 *  server 409s for them). Up/down buttons replace the console's drag to
 *  reorder; each move saves the whole priority order. */
function EventSelectionControl({ state, name }: { state: PartyStateDynamic; name: string }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const navigate = useNavigate()
  const now = useClock()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<string | null>(null)
  const policy = eventPolicy(state, name)
  const selected = selectedEvents(state, name)
  const order = eventPriorityOrder(state, name)
  // Server schedules are observations, not the supported catalog: seasonal
  // bosses stay selectable even when the current feed omits them.
  const schedules = new Map((state.eventSchedules ?? []).map((event) => [event.id, event]))
  const rows: EventSchedule[] = [...new Set([...order, ...schedules.keys()])]
    .map((id) => {
      const schedule = schedules.get(id)
      return { ...schedule, id, name: eventDisplayNames[id] ?? schedule?.name ?? id }
    })
    .filter((event) => event.id !== 'cave' && event.name.toLowerCase() !== 'cave of many dreams')
  const onChange = async (events: string[]) => {
    setError(null)
    const result = await api.setEventSelections(name, events)
    if (result.kind === 'failure') setError(result.message)
    else await refreshNow()
  }
  const move = async (id: string, offset: -1 | 1) => {
    const index = order.indexOf(id)
    const target = order[index + offset]
    if (!target) return
    const next = [...order]
    next[index] = target
    next[index + offset] = id
    setError(null)
    const result = await api.setEventPriorities(name, next)
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
          <p className="mt-2 text-muted-foreground">Higher numbers attend first. Use the arrows to reorder.</p>
          {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
          {rows.map((event) => {
            const supported = supportedEvents.includes(event.id)
            const allowed = supported
            // A leader's manual travel skip stays on the leader; followers still attend (attendance-limits.ts).
            const ignored = [state.eventAttendance?.[name]?.[event.id], state.eventAttendance?.[policy.source]?.[event.id]].find(
              (entry, index) => entry?.ignored && !entry.ended && (index === 0 || entry.ignored !== 'manual travel'),
            )?.ignored
            const index = order.indexOf(event.id)
            return (
              <div key={event.id}>
                <div className="flex items-center gap-2 py-2">
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      aria-label={`Move ${event.name} up`}
                      disabled={!supported || policy.inherited || index <= 0}
                      onClick={() => void move(event.id, -1)}
                      className="rounded border border-border p-0.5 disabled:opacity-30"
                    >
                      <ChevronUp className="size-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${event.name} down`}
                      disabled={!supported || policy.inherited || index < 0 || index >= order.length - 1}
                      onClick={() => void move(event.id, 1)}
                      className="rounded border border-border p-0.5 disabled:opacity-30"
                    >
                      <ChevronDown className="size-3" />
                    </button>
                  </div>
                  <span aria-label={`${event.name} priority`} className="w-6 shrink-0 text-center text-emerald-200">
                    {supported ? order.length - index : 0}
                  </span>
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
                    {ignored && <span className="block text-amber-200">Skipped this instance: {ignored}</span>}
                  </span>
                  <button
                    type="button"
                    aria-label={`${event.name} settings`}
                    aria-expanded={settings === event.id}
                    disabled={!supported}
                    onClick={() => setSettings(settings === event.id ? null : event.id)}
                    className="ml-auto rounded border border-border p-2 text-pink-200 disabled:opacity-30"
                  >
                    <Settings className="size-4" />
                  </button>
                </div>
                {settings === event.id && (
                  <EventLimitsPanel
                    event={event.id}
                    label={event.name}
                    limits={eventLimits(state, name)[event.id] ?? { deathLimit: null, timeLimitMinutes: null }}
                    inherited={policy.inherited}
                    onClose={() => setSettings(null)}
                    onSave={async (limits) => {
                      const result = await api.setEventLimits(name, event.id, limits)
                      if (result.kind === 'failure') return result.message
                      await refreshNow()
                      return null
                    }}
                    onAnniversary={() => navigate('/anniversary')}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

/** Console 1.4 event-limits-dialog.tsx as an inline group under the event's row. */
function EventLimitsPanel({
  event,
  label,
  limits,
  inherited,
  onClose,
  onSave,
  onAnniversary,
}: {
  event: string
  label: string
  limits: EventLimits
  inherited: boolean
  onClose: () => void
  // Resolves to the server's error message, or null once saved.
  onSave: (limits: EventLimits) => Promise<string | null>
  onAnniversary: () => void
}) {
  const [deaths, setDeaths] = useState(limits.deathLimit == null ? '' : String(limits.deathLimit))
  const [minutes, setMinutes] = useState(limits.timeLimitMinutes == null ? '' : String(limits.timeLimitMinutes))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const value = { deathLimit: deaths.trim() ? Number(deaths) : null, timeLimitMinutes: minutes.trim() ? Number(minutes) : null }
  return (
    <div role="group" aria-label={`${label} settings`} className="mb-2 flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium">{label} settings</p>
      <p className="text-muted-foreground">
        Blank means unlimited. Exceeding a limit skips the current event instance, then resumes farming or attends the next eligible event.
      </p>
      <label className="flex flex-col gap-1">
        Death limit
        <Input
          aria-label="Death limit"
          type="number"
          min="0"
          step="1"
          value={deaths}
          disabled={inherited || saving}
          onChange={(e) => setDeaths(e.target.value)}
          placeholder="Unlimited"
        />
      </label>
      <p className="text-muted-foreground">Stop rejoining after more than this many deaths. 0 stops after the first death.</p>
      <label className="flex flex-col gap-1">
        Time limit (mins)
        <Input
          aria-label="Time limit (mins)"
          type="number"
          min="0.01"
          step="any"
          value={minutes}
          disabled={inherited || saving}
          onChange={(e) => setMinutes(e.target.value)}
          placeholder="Unlimited"
        />
      </label>
      {inherited && <p className="text-amber-200">Using the leader’s event settings.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {event === 'anniversary' && (
        <Button variant="outline" size="sm" onClick={onAnniversary}>
          Anniversary visit settings
        </Button>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" aria-label="Close event settings" disabled={saving} onClick={onClose}>
          Close
        </Button>
        {!inherited && (
          <Button
            size="sm"
            disabled={saving || !validEventLimits(value)}
            onClick={async () => {
              setSaving(true)
              setError('')
              const failure = await onSave(value)
              setSaving(false)
              if (failure) setError(failure)
              else onClose()
            }}
          >
            Save event settings
          </Button>
        )}
      </div>
    </div>
  )
}
