/** Web Push for this PWA: subscribes the installed app with the notifier
 *  running in the PWA container (web/notifier, nginx /notify/). Works on
 *  Android Chrome over HTTPS and on iOS 16.4+ once added to the Home Screen. */
export type NotificationCategory = 'characters' | 'merchant'
export const NOTIFICATION_CATEGORIES: { id: NotificationCategory; label: string; description: string }[] = [
  { id: 'characters', label: 'Character stuck or offline', description: 'A character stops reporting for 2 minutes, loses its connection or stops its CODE - and when it recovers.' },
  { id: 'merchant', label: 'Merchant and mail', description: 'Stand sales, WTB orders filled, merchant purchases, merchant errors, and new mail.' },
]

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

export type PushStatus = { subscribed: boolean; categories: NotificationCategory[]; paused?: boolean }

export async function pushStatus(baseUrl: string): Promise<PushStatus> {
  const subscription = await currentSubscription()
  if (!subscription) return { subscribed: false, categories: [] }
  const status = await notifier<PushStatus>(baseUrl, `/status?endpoint=${encodeURIComponent(subscription.endpoint)}`)
  return { ...status, categories: status.categories ?? [] }
}

export async function enablePush(baseUrl: string, categories: NotificationCategory[]): Promise<PushStatus> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Notifications are blocked for this app in your phone settings.' : 'Notification permission was not granted.')
  const { publicKey } = await notifier<{ publicKey: string }>(baseUrl, '/config')
  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) })
  return notifier<PushStatus>(baseUrl, '/subscribe', { subscription: subscription.toJSON(), categories })
}

export async function setPushCategories(baseUrl: string, categories: NotificationCategory[]): Promise<PushStatus> {
  const subscription = await currentSubscription()
  if (!subscription) throw new Error('Notifications are not enabled on this device.')
  return notifier<PushStatus>(baseUrl, '/categories', { endpoint: subscription.endpoint, categories })
}

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
