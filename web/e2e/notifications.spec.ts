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

test('Notifications: enable on this device with chosen alerts, adjust limits, rare rule, quiet hours and mutes, send a test, and turn off', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  await server.install(page)
  await stubPush(page)
  const calls: { path: string; body: Record<string, unknown> | null }[] = []
  let subscribed: Record<string, unknown> | null = null
  let settings: Record<string, unknown> = { stuckMinutes: 2, idleMinutes: 5, errors: { count: 5, minutes: 10 }, deaths: { count: 3, minutes: 30 }, rare: { mode: 'chance', chanceOneIn: 10000, minGold: 1000000 } }
  await page.route('**/notify/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/notify/, '')
    const body = route.request().method() === 'POST' ? (route.request().postDataJSON() as Record<string, unknown>) : null
    calls.push({ path, body })
    if (path === '/config') return route.fulfill({ json: { publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U', alerts: [] } })
    if (path === '/status') return route.fulfill({ json: subscribed ?? { subscribed: false } })
    if (path === '/settings') return route.fulfill({ json: body ? (settings = { ...settings, ...body }) : settings })
    if (path === '/subscribe') {
      const { subscription: _subscription, ...prefs } = body!
      return route.fulfill({ json: (subscribed = { subscribed: true, ...prefs }) })
    }
    if (path === '/prefs') {
      const { endpoint: _endpoint, ...prefs } = body!
      return route.fulfill({ json: (subscribed = { ...subscribed, ...prefs }) })
    }
    if (path === '/test') return route.fulfill({ json: { sent: true } })
    if (path === '/unsubscribe') return route.fulfill({ json: (subscribed = { subscribed: false }) })
    return route.fulfill({ status: 404, json: {} })
  })

  await page.goto('/settings')
  const section = page.getByRole('region', { name: 'Notifications' })
  await expect(section.getByText('Off for this device.')).toBeVisible()
  await section.getByRole('checkbox', { name: /New mail/ }).uncheck()
  await section.getByRole('button', { name: 'Enable notifications on this device' }).click()
  await expect(section.getByText('On for this device.')).toBeVisible()
  const subscribe = calls.find((call) => call.path === '/subscribe')?.body
  expect(subscribe).toMatchObject({ subscription: { endpoint: 'https://push.example/abc' }, quiet: null, muted: [] })
  expect(subscribe!.alerts).toEqual(['stuck', 'idle', 'deaths', 'errors', 'inventory', 'bank', 'rules', 'orders', 'events', 'rare', 'trading'])

  // Per-device alert choice saves straight away once subscribed.
  await section.getByRole('checkbox', { name: /New mail/ }).check()
  await expect.poll(() => calls.filter((call) => call.path === '/prefs').at(-1)?.body?.alerts).toContain('mail')

  // Account-wide limits save on blur.
  await section.getByRole('textbox', { name: 'No actions minutes' }).fill('12')
  await section.getByRole('textbox', { name: 'No actions minutes' }).blur()
  await expect.poll(() => calls.filter((call) => call.path === '/settings' && call.body).at(-1)?.body).toEqual({ idleMinutes: 12 })
  await section.getByRole('textbox', { name: 'Errors count' }).fill('8')
  await section.getByRole('textbox', { name: 'Errors count' }).press('Enter')
  await expect.poll(() => calls.filter((call) => call.path === '/settings' && call.body).at(-1)?.body).toEqual({ errors: { count: 8, minutes: 10 } })

  // Rare drops: chance, gold value, or both.
  await expect(section.getByRole('textbox', { name: 'Rare drop minimum gold' })).toHaveCount(0)
  await section.getByRole('radio', { name: /Both/ }).check()
  await expect.poll(() => calls.filter((call) => call.path === '/settings' && call.body).at(-1)?.body).toMatchObject({ rare: { mode: 'both' } })
  await section.getByRole('textbox', { name: 'Rare drop minimum gold' }).fill('5000000')
  await section.getByRole('textbox', { name: 'Rare drop minimum gold' }).blur()
  await expect.poll(() => calls.filter((call) => call.path === '/settings' && call.body).at(-1)?.body).toEqual({ rare: { mode: 'both', chanceOneIn: 10000, minGold: 5000000 } })
  await expect(section.getByRole('textbox', { name: 'Rare drop chance one in' })).toBeVisible()

  // Quiet hours and muted characters are per device.
  await section.getByRole('checkbox', { name: /Silence notifications/ }).check()
  await expect.poll(() => calls.filter((call) => call.path === '/prefs').at(-1)?.body?.quiet).toMatchObject({ start: '22:00', end: '07:00' })
  await section.getByRole('checkbox', { name: 'Mute Leada' }).check()
  await expect.poll(() => calls.filter((call) => call.path === '/prefs').at(-1)?.body?.muted).toEqual(['Leada'])

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

test('Notifications: over plain HTTP the app explains that push needs HTTPS and links the setup guide', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  await server.install(page)
  await page.addInitScript(() => Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true }))
  await page.goto('/settings')
  const section = page.getByRole('region', { name: 'Notifications' })
  await expect(section.getByText(/this address is plain HTTP/)).toBeVisible()
  await expect(section.getByRole('link', { name: 'How to set up HTTPS' })).toHaveAttribute('href', /DEPLOYMENT\.md#3e-phone-notifications-android-and-ios$/)
  await expect(section.getByRole('button', { name: /Enable notifications/ })).toHaveCount(0)
})
