import { useEffect, useState, type ReactNode } from 'react'
import { useCharacters, useServerSettings } from '@/data/PartyDataProvider'
import { Button } from '@/components/ui/button'
import {
  ALERT_GROUPS,
  ALL_ALERTS,
  disablePush,
  enablePush,
  notifierSettings,
  pushStatus,
  pushSupport,
  quietHours,
  saveNotifierSettings,
  sendTestPush,
  setPushPrefs,
  type AlertId,
  type DevicePrefs,
  type NotifierSettings,
  type PushStatus,
} from '@/lib/pushNotifications'

// DEPLOYMENT.md section 3e: the HTTPS options for push.
const HTTPS_GUIDE = 'https://github.com/Icelocked/adventure-land-mobile-party-console/blob/main/DEPLOYMENT.md#3e-phone-notifications-android-and-ios'

/** A number field that saves on blur or Enter. */
function LimitInput({ label, value, onSave, width = 'w-16' }: { label: string; value: number; onSave: (value: number) => void; width?: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      className={`${width} rounded border border-border bg-background px-1.5 py-1 text-center`}
      value={draft ?? String(value)}
      onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ''))}
      onBlur={() => {
        if (draft !== null && Number(draft) >= 1 && Number(draft) !== value) onSave(Number(draft))
        setDraft(null)
      }}
      onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
    />
  )
}

/** Phone notifications (specific to this app):
 *  enable push on this device, choose alerts, limits, quiet hours and muted characters. */
export function NotificationsSection() {
  const server = useServerSettings()
  const characters = useCharacters()
  const support = pushSupport()
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [prefs, setPrefs] = useState<DevicePrefs>({ alerts: ALL_ALERTS, quiet: null, muted: [] })
  const [limits, setLimits] = useState<NotifierSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (support !== 'supported') return
    let alive = true
    pushStatus(server.baseUrl)
      .then((value) => {
        if (!alive) return
        setStatus(value)
        if (value.subscribed) setPrefs({ alerts: (value.alerts as AlertId[]) ?? [], quiet: value.quiet ?? null, muted: value.muted ?? [] })
      })
      .catch((cause: Error) => alive && setError(cause.message))
    notifierSettings(server.baseUrl)
      .then((value) => alive && setLimits(value))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [support, server.baseUrl])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  const updatePrefs = (patch: Partial<DevicePrefs>) => {
    setPrefs((current) => ({ ...current, ...patch }))
    if (status?.subscribed) void run(async () => setStatus(await setPushPrefs(server.baseUrl, patch)))
  }
  const updateLimits = (patch: Partial<NotifierSettings>) => {
    const previous = limits
    setLimits((current) => (current ? { ...current, ...patch } : current))
    void run(async () => {
      try {
        setLimits(await saveNotifierSettings(server.baseUrl, patch))
      } catch (cause) {
        setLimits(previous)
        throw cause
      }
    })
  }
  const toggleAlert = (id: AlertId, on: boolean) => updatePrefs({ alerts: on ? [...prefs.alerts, id] : prefs.alerts.filter((value) => value !== id) })

  // Inline limits under the alerts that have them.
  const limitsFor = (id: AlertId): ReactNode => {
    if (!limits) return null
    const row = (children: ReactNode) => <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{children}</div>
    if (id === 'stuck') return row(<>After <LimitInput label="Stuck after minutes" value={limits.stuckMinutes} onSave={(stuckMinutes) => updateLimits({ stuckMinutes })} /> min without a report</>)
    if (id === 'idle') return row(<>After <LimitInput label="No actions minutes" value={limits.idleMinutes} onSave={(idleMinutes) => updateLimits({ idleMinutes })} /> min without actions</>)
    if (id === 'deaths')
      return row(
        <>
          <LimitInput label="Deaths count" value={limits.deaths.count} onSave={(count) => updateLimits({ deaths: { ...limits.deaths, count } })} /> deaths within{' '}
          <LimitInput label="Deaths window minutes" value={limits.deaths.minutes} onSave={(minutes) => updateLimits({ deaths: { ...limits.deaths, minutes } })} /> min
        </>,
      )
    if (id === 'errors')
      return row(
        <>
          <LimitInput label="Errors count" value={limits.errors.count} onSave={(count) => updateLimits({ errors: { ...limits.errors, count } })} /> errors within{' '}
          <LimitInput label="Errors window minutes" value={limits.errors.minutes} onSave={(minutes) => updateLimits({ errors: { ...limits.errors, minutes } })} /> min
        </>,
      )
    if (id === 'rare') {
      const rare = limits.rare
      return (
        <div role="radiogroup" aria-label="Rare drop rule" className="mt-1 flex flex-col gap-1.5 text-xs text-muted-foreground">
          {(
            [
              ['chance', 'Drop chance under a threshold'],
              ['value', 'Worth at least a gold value'],
              ['both', 'Both (rare and valuable)'],
            ] as const
          ).map(([mode, label]) => (
            <label key={mode} className="flex items-center gap-2">
              <input type="radio" name="rare-mode" checked={rare.mode === mode} onChange={() => updateLimits({ rare: { ...rare, mode } })} />
              {label}
            </label>
          ))}
          {rare.mode !== 'value' &&
            row(
              <>
                Drop chance under 1 in <LimitInput label="Rare drop chance one in" width="w-24" value={rare.chanceOneIn} onSave={(chanceOneIn) => updateLimits({ rare: { ...rare, chanceOneIn } })} />
              </>,
            )}
          {rare.mode !== 'chance' &&
            row(
              <>
                Worth at least <LimitInput label="Rare drop minimum gold" width="w-28" value={rare.minGold} onSave={(minGold) => updateLimits({ rare: { ...rare, minGold } })} /> gold
              </>,
            )}
        </div>
      )
    }
    return null
  }

  return (
    <section aria-label="Notifications" className="rounded-md border border-border bg-card p-4 text-sm">
      <div className="mb-1 font-medium">Notifications</div>
      <p className="mb-2 text-xs text-muted-foreground">Get a phone notification when something needs your attention, even with the app closed.</p>
      {support === 'insecure' && (
        <p className="text-xs text-amber-300">
          Phones only allow notifications when the app is opened over HTTPS with a trusted certificate - this address is plain HTTP. The easiest fix is Tailscale Serve (private to your
          tailnet); notifications still reach your phone anywhere once enabled.{' '}
          <a className="underline" href={HTTPS_GUIDE} target="_blank" rel="noreferrer">
            How to set up HTTPS
          </a>
        </p>
      )}
      {support === 'ios-needs-install' && (
        <p className="text-xs text-amber-300">On iPhone and iPad, add this app to your Home Screen (Share → Add to Home Screen), open it from there, then enable notifications. Requires iOS 16.4 or later.</p>
      )}
      {support === 'unsupported' && <p className="text-xs text-amber-300">This browser does not support push notifications.</p>}
      {support === 'supported' && (
        <>
          {ALERT_GROUPS.map((group) => (
            <fieldset key={group.title} className="mt-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</legend>
              {group.note && <p className="text-[11px] text-muted-foreground">{group.note}</p>}
              <div className="mt-1 flex flex-col gap-2">
                {group.alerts.map((alert) => (
                  <div key={alert.id}>
                    <label className="flex items-start gap-2">
                      <input type="checkbox" className="mt-0.5 size-4" disabled={busy} checked={prefs.alerts.includes(alert.id)} onChange={(event) => toggleAlert(alert.id, event.target.checked)} />
                      <span>
                        {alert.label}
                        <span className="block text-xs text-muted-foreground">{alert.description}</span>
                      </span>
                    </label>
                    {prefs.alerts.includes(alert.id) && <div className="pl-6">{limitsFor(alert.id)}</div>}
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
          {limits && <p className="mt-2 text-[11px] text-muted-foreground">Limits and the rare-drop rule apply to every device; the alerts you pick, quiet hours and muted characters are for this device.</p>}

          <fieldset className="mt-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quiet hours</legend>
            <label className="mt-1 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={!!prefs.quiet} onChange={(event) => updatePrefs({ quiet: event.target.checked ? quietHours('22:00', '07:00') : null })} />
              Silence notifications from
              <input aria-label="Quiet hours start" type="time" disabled={!prefs.quiet} value={prefs.quiet?.start ?? '22:00'} onChange={(event) => updatePrefs({ quiet: quietHours(event.target.value, prefs.quiet?.end ?? '07:00') })} className="rounded border border-border bg-background px-1" />
              to
              <input aria-label="Quiet hours end" type="time" disabled={!prefs.quiet} value={prefs.quiet?.end ?? '07:00'} onChange={(event) => updatePrefs({ quiet: quietHours(prefs.quiet?.start ?? '22:00', event.target.value) })} className="rounded border border-border bg-background px-1" />
            </label>
            <p className="text-[11px] text-muted-foreground">Character health alerts still come through.</p>
          </fieldset>

          {Object.keys(characters).length > 0 && (
            <fieldset className="mt-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mute characters</legend>
              <div className="mt-1 flex flex-wrap gap-3 text-xs">
                {Object.keys(characters).map((name) => (
                  <label key={name} className="flex items-center gap-1.5">
                    <input type="checkbox" aria-label={`Mute ${name}`} checked={prefs.muted.includes(name)} onChange={(event) => updatePrefs({ muted: event.target.checked ? [...prefs.muted, name] : prefs.muted.filter((value) => value !== name) })} />
                    {name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {status?.subscribed ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await sendTestPush(server.baseUrl)
                      setNotice('Test notification sent.')
                    })
                  }
                >
                  Send test notification
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await disablePush(server.baseUrl)
                      setStatus({ subscribed: false })
                    })
                  }
                >
                  Turn off on this device
                </Button>
              </>
            ) : (
              <Button size="sm" disabled={busy || !prefs.alerts.length} onClick={() => void run(async () => setStatus(await enablePush(server.baseUrl, prefs)))}>
                {busy ? 'Enabling…' : 'Enable notifications on this device'}
              </Button>
            )}
          </div>
          <p role="status" className="mt-2 text-xs text-muted-foreground">
            {status === null ? 'Checking…' : status.subscribed ? (status.paused ? 'On, but paused: enable again to reconnect.' : 'On for this device.') : 'Off for this device.'}
          </p>
          {notice && <p className="mt-1 text-xs text-emerald-300">{notice}</p>}
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
