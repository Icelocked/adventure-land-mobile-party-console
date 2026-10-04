import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// The browser's push plumbing is stubbed; the notifier API (/notify/*) is mocked.
async function stubPush(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    let subscription: { endpoint: string; toJSON(): unknown; unsubscribe(): Promise<boolean> } | null = null
    const pushManager = {
      getSubscription: async () => subscription,
      subscribe: async () => {
        subscription = { endpoint: 'https://push.example/abc', toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }), unsubscribe: async () => ((subscription = null), true) }
        return subscription
      },
    }
    Object.defineProperty(window, 'PushManager', { value: function PushManager() {}, configurable: true })
    Object.defineProperty(window, 'Notification', { value: { permission: 'default', requestPermission: async () => 'granted' }, configurable: true })
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve({ pushManager }), register: async () => ({}), addEventListener() {}, getRegistration: async () => undefined }, configurable: true })
  })
}

test('Notifications: enable on this device with chosen categories, change them, send a test, and turn off', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  await server.install(page)
  await stubPush(page)
  const calls: { path: string; body: Record<string, unknown> | null }[] = []
  let subscribed: Record<string, unknown> | null = null
  await page.route('**/notify/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/notify/, '')
    const body = route.request().method() === 'POST' ? (route.request().postDataJSON() as Record<string, unknown>) : null
    calls.push({ path, body })
    if (path === '/config') return route.fulfill({ json: { publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U', categories: ['characters', 'merchant'] } })
    if (path === '/status') return route.fulfill({ json: subscribed ?? { subscribed: false } })
    if (path === '/subscribe') return route.fulfill({ json: (subscribed = { subscribed: true, categories: body!.categories }) })
    if (path === '/categories') return route.fulfill({ json: (subscribed = { subscribed: true, categories: body!.categories }) })
    if (path === '/test') return route.fulfill({ json: { sent: true } })
    if (path === '/unsubscribe') return route.fulfill({ json: (subscribed = { subscribed: false }) })
    return route.fulfill({ status: 404, json: {} })
  })

  await page.goto('/settings')
  const section = page.getByRole('region', { name: 'Notifications' })
  await expect(section.getByText('Off for this device.')).toBeVisible()
  await section.getByRole('checkbox', { name: /Merchant and mail/ }).uncheck()
  await section.getByRole('button', { name: 'Enable notifications on this device' }).click()
  await expect(section.getByText('On for this device.')).toBeVisible()
  expect(calls.find((call) => call.path === '/subscribe')?.body).toMatchObject({ subscription: { endpoint: 'https://push.example/abc' }, categories: ['characters'] })

  await section.getByRole('checkbox', { name: /Merchant and mail/ }).check()
  await expect.poll(() => calls.find((call) => call.path === '/categories')?.body).toMatchObject({ endpoint: 'https://push.example/abc', categories: ['characters', 'merchant'] })
  await section.getByRole('button', { name: 'Send test notification' }).click()
  await expect(section.getByText('Test notification sent.')).toBeVisible()
  await section.getByRole('button', { name: 'Turn off on this device' }).click()
  await expect(section.getByText('Off for this device.')).toBeVisible()
})

test('Notifications: iPhone outside the Home Screen explains how to enable push', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  await server.install(page)
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', configurable: true }))
  await page.goto('/settings')
  await expect(page.getByRole('region', { name: 'Notifications' }).getByText(/add this app to your Home Screen/)).toBeVisible()
})
