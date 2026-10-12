import { useState } from 'react'
import { usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ApiResult, CommandResult } from '@/api/partyApi'
import type { BossChaseState, DailyChaseState, RealmOption } from '@/models'

// Console 1.4 boss-chase-setting.tsx, daily-chase-setting.tsx and
// realm-hop-blacklist-setting.tsx, shown under the realm panel as on the dashboard.

const realmLabel = (realm: string) => realm.replace(/^SR_/, '').replace(/(US|EU|ASIA)/, '$1 ')
const timeLabel = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const bossLabel: Record<string, string> = {
  franky: 'Franky', icegolem: 'Ice Golem', crabxx: 'Giga Crab',
  mrpumpkin: 'Mr. Pumpkin', mrgreen: 'Mr. Green', dragold: 'Dragold', grinch: 'Grinch',
}
const eventLabel: Record<string, string> = {
  crabxx: 'Giga Crab', goobrawl: 'Goo Brawl', abtesting: 'A/B Testing', icegolem: 'Ice Golem', franky: 'Franky',
}

/** One POST at a time per setting (the console's usePartyAction): the
 *  fieldset disables while it runs and the server's error shows until the next send. */
function useRealmAction() {
  const refreshNow = useRefreshDynamicStateNow()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (send: () => Promise<ApiResult<CommandResult>>) => {
    setError(null)
    setPending(true)
    const result = await send()
    setPending(false)
    if (result.kind === 'failure') setError(result.message)
    else await refreshNow()
  }
  return { pending, error, run }
}

function OnOff({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <Button type="button" variant={on ? 'default' : 'outline'} size="sm" aria-pressed={on} aria-label={label} className="shrink-0" onClick={onClick}>
      {on ? 'On' : 'Off'}
    </Button>
  )
}

export function BossChaseSetting({ chase }: { chase?: BossChaseState | null }) {
  const api = usePartyApi()
  const action = useRealmAction()
  // An unsaved edit overrides the coordinator value; clearing it follows the server again.
  const [draft, setDraft] = useState<string | null>(null)
  const minEta = draft ?? String(chase?.minEtaMinutes ?? 15)
  const enabled = chase?.enabled === true
  const validEta = minEta.trim() !== '' && Number.isFinite(Number(minEta)) && Number(minEta) >= 0
  return (
    <fieldset disabled={action.pending} className="mt-3 flex flex-col gap-2 rounded-md border border-border p-3 text-xs">
      <legend className="sr-only">Event boss realm chase</legend>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Chase event bosses across realms</p>
          <p className="text-muted-foreground">
            When an event boss (Franky, Ice Golem, Giga Crab, or a seasonal boss) isn&apos;t live here, move the party to a realm where one is, then return home once
            it&apos;s gone. Only bosses whose event is selected are chased.
          </p>
        </div>
        <OnOff on={enabled} label="Chase event bosses across realms" onClick={() => void action.run(() => api.setBossChase({ enabled: !enabled }))} />
      </div>
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          Only hop if at least this many minutes remain
          <Input type="number" min={0} step={1} value={minEta} onChange={(e) => setDraft(e.target.value)} />
        </label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!validEta || Number(minEta) === chase?.minEtaMinutes}
          onClick={() => {
            void action.run(() => api.setBossChase({ minEtaMinutes: Number(minEta) }))
            setDraft(null)
          }}
        >
          Save
        </Button>
      </div>
      <p className="text-muted-foreground">Hop Sickness lasts 12 minutes; the remaining time is estimated from each boss&apos;s observed HP drain.</p>
      {chase?.trip && (
        <p className="rounded-md bg-primary/10 p-2">
          {bossLabel[chase.trip.boss] || chase.trip.boss} · {chase.trip.arrived ? (chase.trip.respawnAt ? 'waiting for respawn on ' : 'fighting on ') : 'moving to '}
          {realmLabel(chase.trip.realm)}
          {chase.trip.respawnAt ? ` at ${timeLabel(chase.trip.respawnAt)}` : ''}
          {chase.trip.returnRealm ? ` · returns to ${realmLabel(chase.trip.returnRealm)}` : ''}
        </p>
      )}
      {enabled &&
        (chase?.sightings?.length ? (
          <ul className="flex flex-col gap-1">
            {chase.sightings.map((sighting) => (
              <li key={sighting.boss + sighting.realm} className="flex justify-between gap-2">
                <span>
                  {bossLabel[sighting.boss] || sighting.boss} · {realmLabel(sighting.realm)}
                  {sighting.target ? ` · ${sighting.target}` : ''}
                </span>
                <span className="font-mono">
                  {(sighting.hp / 1e6).toFixed(1)}M HP · {sighting.etaMinutes == null ? 'estimating…' : `~${Math.round(sighting.etaMinutes)} min`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">{chase?.checkedAt ? 'No live bosses reported.' : 'Waiting for the first check…'}</p>
        ))}
      {enabled && !!chase?.respawns?.length && (
        <ul className="flex flex-col gap-1 text-muted-foreground">
          {chase.respawns.map((entry) => (
            <li key={'respawn' + entry.boss + entry.realm} className="flex justify-between gap-2">
              <span>
                {bossLabel[entry.boss] || entry.boss} · {realmLabel(entry.realm)}
              </span>
              <span className="font-mono">respawns {timeLabel(entry.respawnAt)}</span>
            </li>
          ))}
        </ul>
      )}
      {chase?.lastError && <p role="alert" className="text-destructive">{chase.lastError}</p>}
      {action.error && <p role="alert" className="text-destructive">{action.error}</p>}
    </fieldset>
  )
}

export function DailyChaseSetting({ chase }: { chase?: DailyChaseState | null }) {
  const api = usePartyApi()
  const action = useRealmAction()
  // An unsaved edit overrides the coordinator value; clearing it follows the server again.
  const [draft, setDraft] = useState<string | null>(null)
  const lead = draft ?? String(chase?.leadMinutes ?? 16)
  const enabled = chase?.enabled === true
  const otherRegions = chase?.otherRegions === true
  const validLead = lead.trim() !== '' && Number(lead) >= 14 && Number(lead) <= 120
  return (
    <fieldset disabled={action.pending} className="mt-3 flex flex-col gap-2 rounded-md border border-border p-3 text-xs">
      <legend className="sr-only">Scheduled event realm prediction</legend>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Predict scheduled events across realms</p>
          <p className="text-muted-foreground">
            Each realm repeats a fixed cycle: dailies every 3 slots, nightlies (Ice Golem/Franky) every 2. When this realm won&apos;t get a selected event, move the
            party ahead of the slot to a realm predicted to get it, then return home.
          </p>
        </div>
        <OnOff on={enabled} label="Predict scheduled events across realms" onClick={() => void action.run(() => api.setDailyChase({ enabled: !enabled }))} />
      </div>
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          Arrive this many minutes before the slot (min 14)
          <Input type="number" min={14} max={120} step={1} value={lead} onChange={(e) => setDraft(e.target.value)} />
        </label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!validLead || Number(lead) === chase?.leadMinutes}
          onClick={() => {
            void action.run(() => api.setDailyChase({ leadMinutes: Number(lead) }))
            setDraft(null)
          }}
        >
          Save
        </Button>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground">Also chase other regions&apos; slots (extra events at different times)</p>
        <OnOff on={otherRegions} label="Also chase other regions' slots" onClick={() => void action.run(() => api.setDailyChase({ otherRegions: !otherRegions }))} />
      </div>
      {chase?.trip && (
        <p className="rounded-md bg-primary/10 p-2">
          {eventLabel[chase.trip.event]} · {chase.trip.arrived ? 'waiting on ' : 'moving to '}
          {realmLabel(chase.trip.realm)} for {timeLabel(chase.trip.slotAt)}
          {chase.trip.returnRealm ? ` · returns to ${realmLabel(chase.trip.returnRealm)}` : ''}
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {(chase?.upcoming || []).map((next) => (
          <li key={next.rotation + next.region} className="flex justify-between gap-2">
            <span className="font-mono">
              {next.region} {next.rotation} {timeLabel(next.slotAt)}
            </span>
            <span className="text-right">
              {next.predictions.length ? next.predictions.map((entry) => `${realmLabel(entry.realm)}: ${eventLabel[entry.event]}`).join(' · ') : 'no predictions yet'}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        Predictions come from sightings: the party&apos;s own realm, plus Giga Crab, Goo Brawl, Ice Golem and Franky bosses reported to ALData.
      </p>
      {chase?.lastError && <p role="alert" className="text-destructive">{chase.lastError}</p>}
      {action.error && <p role="alert" className="text-destructive">{action.error}</p>}
    </fieldset>
  )
}

/** Realms boss chase and daily-event chase never hop to. Manual realm changes are unaffected. */
export function RealmHopBlacklistSetting({ realms, blacklist }: { realms: RealmOption[]; blacklist?: string[] }) {
  const api = usePartyApi()
  const action = useRealmAction()
  const saved = blacklist || []
  const toggle = (realm: string, blocked: boolean) =>
    void action.run(() => api.setRealmHopBlacklist(blocked ? [...saved, realm] : saved.filter((entry) => entry !== realm)))
  return (
    <fieldset disabled={action.pending} className="mt-3 flex flex-col gap-2 rounded-md border border-border p-3 text-xs">
      <legend className="sr-only">Realm hopping blacklist</legend>
      <div>
        <p className="text-sm font-medium">Never hop to these realms</p>
        <p className="text-muted-foreground">
          Boss chase and event prediction skip checked realms, e.g. ones whose ping cripples DPS. Changing realm by hand still works. PVP realms are always skipped.
        </p>
      </div>
      {realms.length ? (
        <ul className="grid gap-1 sm:grid-cols-2">
          {realms.map((realm) => {
            const blocked = realm.pvp || saved.includes(realm.key)
            return (
              <li key={realm.key}>
                <label className="flex items-center gap-2 rounded-md border border-border px-2 py-1">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={blocked}
                    disabled={realm.pvp}
                    aria-label={`Never hop to ${realmLabel(realm.key)}`}
                    onChange={(e) => toggle(realm.key, e.target.checked)}
                  />
                  <span className="flex-1">{realmLabel(realm.key)}</span>
                  <span className="font-mono text-muted-foreground">{realm.pvp ? 'PVP · always skipped' : `${realm.players} players`}</span>
                </label>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground">Waiting for the realm list…</p>
      )}
      {action.error && <p role="alert" className="text-destructive">{action.error}</p>}
    </fieldset>
  )
}
