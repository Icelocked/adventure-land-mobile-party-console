import { useEffect, useState } from 'react'
import { useServerSettings } from '@/data/PartyDataProvider'
import { Button } from '@/components/ui/button'
import {
  NOTIFICATION_CATEGORIES,
  disablePush,
  enablePush,
  pushStatus,
  pushSupport,
  sendTestPush,
  setPushCategories,
  type NotificationCategory,
  type PushStatus,
} from '@/lib/pushNotifications'

// DEPLOYMENT.md section 3e: the HTTPS options for push.
const HTTPS_GUIDE = 'https://github.com/Icelocked/adventure-land-mobile-party-console/blob/main/DEPLOYMENT.md#3e-phone-notifications-android-and-ios'

/** Phone notifications (this app's own feature, not part of the dashboard):
 *  enable push on this device and choose what to be told about. */
export function NotificationsSection() {
  const settings = useServerSettings()
  const support = pushSupport()
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [categories, setCategories] = useState<NotificationCategory[]>(NOTIFICATION_CATEGORIES.map((category) => category.id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (support !== 'supported') return
    let alive = true
    pushStatus(settings.baseUrl)
      .then((value) => {
        if (!alive) return
        setStatus(value)
        if (value.subscribed) setCategories(value.categories)
      })
      .catch((cause: Error) => alive && setError(cause.message))
    return () => {
      alive = false
    }
  }, [support, settings.baseUrl])

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
  const toggle = (id: NotificationCategory, checked: boolean) => {
    const next = checked ? [...categories, id] : categories.filter((value) => value !== id)
    setCategories(next)
    if (status?.subscribed) void run(async () => setStatus(await setPushCategories(settings.baseUrl, next)))
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
          <div className="flex flex-col gap-2">
            {NOTIFICATION_CATEGORIES.map((category) => (
              <label key={category.id} className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5 size-4" disabled={busy} checked={categories.includes(category.id)} onChange={(event) => toggle(category.id, event.target.checked)} />
                <span>
                  {category.label}
                  <span className="block text-xs text-muted-foreground">{category.description}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {status?.subscribed ? (
              <>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => {
                  await sendTestPush(settings.baseUrl)
                  setNotice('Test notification sent.')
                })}>
                  Send test notification
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => {
                  await disablePush(settings.baseUrl)
                  setStatus({ subscribed: false, categories: [] })
                })}>
                  Turn off on this device
                </Button>
              </>
            ) : (
              <Button size="sm" disabled={busy || !categories.length} onClick={() => void run(async () => setStatus(await enablePush(settings.baseUrl, categories)))}>
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
