/** Web Push for this PWA: subscribes the installed app with the notifier
 *  running in the PWA container (web/notifier, nginx /notify/). Works on
 *  Android Chrome over HTTPS and on iOS 16.4+ once added to the Home Screen. */
export type AlertId = 'stuck' | 'idle' | 'deaths' | 'errors' | 'rules' | 'orders' | 'events' | 'rare' | 'trading' | 'mail'
export const ALERT_GROUPS: { title: string; note?: string; alerts: { id: AlertId; label: string; description: string }[] }[] = [
  {
    title: 'Character health',
    note: 'These still arrive during quiet hours.',
    alerts: [
      { id: 'stuck', label: 'Stuck or offline', description: 'No status report for a while, a lost connection or stopped CODE - and when it recovers.' },
      { id: 'idle', label: 'No actions', description: 'No fighting, looting, logging or moving for a while (the merchant is excluded).' },
      { id: 'deaths', label: 'Repeated deaths', description: 'Dying again and again within a window.' },
      { id: 'errors', label: 'Error bursts', description: 'Many errors within a window (game log errors, and the merchant’s errors).' },
    ],
  },
  {
    title: 'Progress',
    alerts: [
      { id: 'rules', label: 'Auto-upgrade / auto-compound rule done', description: 'A rule finished its last item (e.g. 1 bow reached +9).' },
      { id: 'orders', label: 'Buy-and-upgrade order done', description: 'A Buy order with a target level left the merchant’s queue.' },
      { id: 'events', label: 'Event completed', description: 'An event one of your characters is signed up for ended.' },
    ],
  },
  {
    title: 'Loot',
    alerts: [{ id: 'rare', label: 'Rare drops', description: 'A looted item matches your rare-drop rule below.' }],
  },
  {
    title: 'Trading and mail',
    alerts: [
      { id: 'trading', label: 'Sales and orders filled', description: 'Stand sales, WTB orders filled, Ponty and ALData purchases, completed sales.' },
      { id: 'mail', label: 'New mail', description: 'A new message arrives in the mailbox.' },
    ],
  },
]
export const ALL_ALERTS: AlertId[] = ALERT_GROUPS.flatMap((group) => group.alerts.map((alert) => alert.id))

export type QuietHours = { start: string; end: string; offsetMinutes: number } | null
export type NotifierSettings = {
  stuckMinutes: number
  idleMinutes: number
  errors: { count: number; minutes: number }
  deaths: { count: number; minutes: number }
  rare: { mode: 'chance' | 'value' | 'both'; chanceOneIn: number; minGold: number }
}
export type DevicePrefs = { alerts: AlertId[]; quiet: QuietHours; muted: string[] }
export type PushStatus = { subscribed: boolean; paused?: boolean } & Partial<DevicePrefs>

export type PushSupport = 'supported' | 'insecure' | 'ios-needs-install' | 'unsupported'

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

export function pushSupport(): PushSupport {
  if (!window.isSecureContext) return 'insecure'
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (isIos() && !isStandalone()) return 'ios-needs-install'
  return capable ? 'supported' : 'unsupported'
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function notifier<T>(baseUrl: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/notify${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(data.error || `Notifications unavailable (HTTP ${response.status})`)
  return data
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

/** This device's quiet hours, in its own time zone. */
export const quietHours = (start: string, end: string): QuietHours => ({ start, end, offsetMinutes: new Date().getTimezoneOffset() })

export async function pushStatus(baseUrl: string): Promise<PushStatus> {
  const subscription = await currentSubscription()
  if (!subscription) return { subscribed: false }
  return notifier<PushStatus>(baseUrl, `/status?endpoint=${encodeURIComponent(subscription.endpoint)}`)
}

export async function enablePush(baseUrl: string, prefs: DevicePrefs): Promise<PushStatus> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Notifications are blocked for this app in your phone settings.' : 'Notification permission was not granted.')
  const { publicKey } = await notifier<{ publicKey: string }>(baseUrl, '/config')
  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) })
  return notifier<PushStatus>(baseUrl, '/subscribe', { subscription: subscription.toJSON(), ...prefs })
}

export async function setPushPrefs(baseUrl: string, prefs: Partial<DevicePrefs>): Promise<PushStatus> {
  const subscription = await currentSubscription()
  if (!subscription) throw new Error('Notifications are not enabled on this device.')
  return notifier<PushStatus>(baseUrl, '/prefs', { endpoint: subscription.endpoint, ...prefs })
}

function checkedSettings(value: NotifierSettings): NotifierSettings {
  const valid = typeof value?.stuckMinutes === 'number' && typeof value.idleMinutes === 'number' && !!value.errors && !!value.deaths && !!value.rare
  if (!valid) throw new Error('Notifications unavailable (unexpected notifier response)')
  return value
}
export const notifierSettings = (baseUrl: string) => notifier<NotifierSettings>(baseUrl, '/settings').then(checkedSettings)
export const saveNotifierSettings = (baseUrl: string, patch: Partial<NotifierSettings>) => notifier<NotifierSettings>(baseUrl, '/settings', patch).then(checkedSettings)

export async function sendTestPush(baseUrl: string): Promise<void> {
  const subscription = await currentSubscription()
  if (!subscription) throw new Error('Notifications are not enabled on this device.')
  await notifier(baseUrl, '/test', { endpoint: subscription.endpoint })
}

export async function disablePush(baseUrl: string): Promise<void> {
  const subscription = await currentSubscription()
  if (!subscription) return
  await notifier(baseUrl, '/unsubscribe', { endpoint: subscription.endpoint }).catch(() => undefined)
  await subscription.unsubscribe()
}
