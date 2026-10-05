import { useState } from 'react'
import { useCharacterDiagnosticsMap, useConfigLoaded, useDynamicState, usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { useClock } from '@/lib/duration'
import { eventTimeLabel } from '@/lib/eventPolicy'
import { Button } from '@/components/ui/button'
import { AccountScreenScaffold } from './AccountScreenScaffold'

type Anniversary = {
  slices?: string[]
  labels?: Record<string, string>
  counts?: Record<string, number>
  completeSets?: number
  tradableNative?: number
  live?: { target?: string; map?: string; x?: number; y?: number; expires?: number; next?: number } | null
  schedule?: { next?: number; live?: boolean } | null
  chatMessage?: string
  chatAdvertisement?: { id: string; message: string; queuedAt: number } | null
  eventCycle?: { endsAt: number; destination?: { label?: string } | null; returnDispatchedAt?: number | null; returnReason?: string | null } | null
  activity?: { at: number; level?: string; message?: string }[]
}

// Rewards green, failures red, routine bookkeeping neutral.
function anniversaryActivityClass(entry: { level?: string; message?: string }) {
  const message = String(entry.message || '')
  if (/\band received [^·]+ Slice$/i.test(message)) return 'text-emerald-300'
  if (entry.level === 'error') return 'text-rose-300'
  if (/\bkissed\b/i.test(message)) return 'text-rose-300'
  if (entry.level === 'featured') return 'text-amber-300'
  return 'text-slate-300'
}

const clockText = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

/** Anniversary event status, opened from the event's settings button. */
export function AnniversaryScreen() {
  const state = useDynamicState()
  const diagnostics = useCharacterDiagnosticsMap()
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const configLoaded = useConfigLoaded()
  const now = useClock()
  const [settingsError, setSettingsError] = useState('')
  const [sendingChat, setSendingChat] = useState(false)
  const [chatError, setChatError] = useState('')
  const anniversary = state.anniversary as Anniversary | undefined
  const merchant = state.merchantCharacter
  const live = anniversary?.live
  const schedule = anniversary?.schedule
  const deadline = Number(live?.expires || schedule?.next || 0)
  const normalizedDeadline = deadline > 0 && deadline < 1e12 ? deadline * 1000 : deadline
  const countdown = normalizedDeadline ? Math.max(0, normalizedDeadline - now) : null
  const countdownText = countdown === null ? null : clockText(countdown)
  const cycle = anniversary?.eventCycle
  const failsafeRemaining = cycle && !cycle.returnDispatchedAt ? Math.max(0, Number(cycle.endsAt) - now) : null
  const failsafeText = failsafeRemaining === null ? null : clockText(failsafeRemaining)

  return (
    <AccountScreenScaffold title="10 Years of Adventure">
      <div className="flex flex-col gap-3 p-3">
        <p className="text-xs text-muted-foreground">Automated featured-player visits and protected slice trading.</p>
        <label className="flex items-center gap-3 rounded border border-border bg-card p-3 text-sm">
          <input
            type="checkbox"
            checked={state.anniversaryAutoChat}
            disabled={!configLoaded}
            onChange={async (e) => {
              setSettingsError('')
              const result = await api.setAnniversaryAutoChat(e.target.checked)
              if (result.kind === 'failure') setSettingsError('Could not save anniversary settings')
              else await refreshNow()
            }}
          />
          Send chat advertisement when receiving cake from a kiss
        </label>
        {settingsError && <p role="alert" className="text-sm text-rose-300">{settingsError}</p>}

        <section aria-label="Anniversary round" className="rounded border border-pink-900 bg-card p-3">
          <p className="font-semibold text-pink-200">{live ? `LIVE · ${live.target}` : 'Waiting for the next round'}</p>
          <p className="mt-1 font-mono text-xs text-pink-300">
            {live
              ? `Expires in ${countdownText || 'unknown'} · ${live.map} [${live.x}, ${live.y}]`
              : countdownText
                ? `Next round: ${eventTimeLabel(normalizedDeadline, now)} · Depart ${eventTimeLabel(normalizedDeadline - 90000, now)}`
                : 'Next round time unavailable'}
          </p>
          {cycle ? (
            <p className="mt-1 font-mono text-xs text-cyan-300">
              {cycle.returnDispatchedAt ? `Return dispatched · ${cycle.returnReason || 'anniversary complete'}` : `Farming return failsafe in ${failsafeText} · ${cycle.destination?.label || 'saved location'}`}
            </p>
          ) : null}
          <div className="mt-3 space-y-1">
            {Object.entries(diagnostics).map(([name, char]) => {
              const stage = (char.anniversaryState as { stage?: string } | undefined)?.stage
              return (
                <div key={name} className="flex justify-between text-xs">
                  <span>{name}</span>
                  <span className={char.anniversaryVisit ? 'text-pink-300' : stage === 'kiss confirmed' ? 'text-emerald-300' : 'text-slate-400'}>
                    {char.anniversaryVisit ? stage || 'ticket ready' : stage || 'no ticket'}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        <section aria-label="Cake slices" className="rounded border border-amber-900 bg-card p-3">
          <p className="font-semibold text-amber-200">Cake slices · {anniversary?.completeSets || 0} complete set(s)</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(anniversary?.slices || []).map((id) => (
              <div key={id} className="flex justify-between rounded border border-border px-2 py-1 text-xs">
                <span>{anniversary?.labels?.[id] || id}</span>
                <span className="font-mono text-amber-300">{anniversary?.counts?.[id] || 0}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-violet-300">Tradable native surplus: {anniversary?.tradableNative || 0}</p>
        </section>

        <section aria-label="Chat advertisement" className="rounded border border-cyan-800 bg-card p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-cyan-200">Chat advertisement</p>
            <Button
              size="sm"
              variant="outline"
              disabled={!anniversary?.chatMessage || sendingChat || !!anniversary?.chatAdvertisement}
              onClick={async () => {
                setSendingChat(true)
                setChatError('')
                const result = await api.sendAnniversaryChatAdvertisement()
                if (result.kind === 'failure') setChatError(result.message)
                else await refreshNow()
                setSendingChat(false)
              }}
              className="border-cyan-500"
            >
              {anniversary?.chatAdvertisement ? `Queued for ${merchant || 'merchant'}` : sendingChat ? 'Queueing…' : 'Send in game chat'}
            </Button>
          </div>
          <p className="mt-2 break-words font-mono text-xs text-cyan-100/80">{anniversary?.chatMessage || 'No safe chat advertisement is currently available.'}</p>
          {chatError && <p role="alert" className="mt-1 text-sm text-rose-300">{chatError}</p>}
        </section>

        <section aria-label="Anniversary activity" className="rounded border border-border bg-card p-3">
          <p className="font-semibold">Anniversary activity</p>
          <div className="mt-2 max-h-52 space-y-1 overflow-y-auto font-mono text-xs">
            {anniversary?.activity?.length ? (
              [...anniversary.activity].reverse().map((entry, index) => (
                <div key={`${entry.at}-${index}`} className={anniversaryActivityClass(entry)}>
                  {new Date(entry.at).toLocaleTimeString()} · {entry.message}
                </div>
              ))
            ) : (
              <p className="text-slate-500">No anniversary activity yet.</p>
            )}
          </div>
        </section>
      </div>
    </AccountScreenScaffold>
  )
}
