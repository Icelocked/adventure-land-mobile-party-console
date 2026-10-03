import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function postBodies(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

function eventsServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  server.addCharacter({ name: 'Folla', ctype: 'priest', level: 60 })
  server.leader = 'Leada'
  server.followers = { Folla: true }
  server.extraState = {
    eventSchedules: [
      { id: 'goobrawl', name: 'Goo Brawl', next: Date.now() + 10 * 60_000 },
      { id: 'anniversary', name: 'Anniversary', live: true },
      { id: 'crabxx', name: 'Giant Crab', stale: true },
      { id: 'halloween', name: 'Halloween' },
    ],
  }
  return server
}

test('Events: sorted schedule labels, a toggle saves the selection, followers use the leader’s events', async ({ page }) => {
  const server = eventsServer()
  await server.install(page)
  const bodies = postBodies(page, 'formation')

  await page.goto('/characters/Leada')
  await page.getByRole('button', { name: 'Events (1) ▾' }).click()
  const events = page.getByRole('group', { name: 'Events' })
  await expect(events.getByText('Anniversary — LIVE')).toBeVisible()
  await expect(events.getByText(/^Goo Brawl — .+ \(9m \d+s\)$/)).toBeVisible()
  await expect(events.getByText('Giant Crab — Time not announced · timing stale')).toBeVisible()
  await expect(events.getByText('Halloween — Unsupported')).toBeVisible()
  await expect(events.getByRole('checkbox', { name: 'Halloween' })).toBeDisabled()
  await expect(events.getByText(/^Cave of Many Dreams — /)).toBeVisible()
  await expect(events.getByRole('checkbox').first()).toHaveAccessibleName('Anniversary')

  await events.getByRole('checkbox', { name: 'Goo Brawl' }).click()
  await expect.poll(() => bodies[0]).toEqual({ character: 'Leada', eventSelections: ['anniversary', 'goobrawl'] })
  await expect(page.getByRole('button', { name: 'Events (2) ▾' })).toBeVisible()

  await page.goto('/characters/Folla')
  await page.getByRole('button', { name: 'Events (2) ▾' }).click()
  const followerEvents = page.getByRole('group', { name: 'Events' })
  await expect(followerEvents.getByText('Using Leada’s events')).toBeVisible()
  await expect(followerEvents.getByRole('checkbox', { name: 'Goo Brawl' })).toBeChecked()
  await expect(followerEvents.getByRole('checkbox', { name: 'Goo Brawl' })).toBeDisabled()

  await followerEvents.getByRole('button', { name: 'Anniversary settings' }).click()
  await expect(page).toHaveURL(/\/anniversary$/)
})

test('Anniversary: live round, failsafe, ticket stages, slices, auto-chat, chat advertisement and activity', async ({ page }) => {
  const server = eventsServer()
  server.addCharacter({ name: 'Merchy', ctype: 'merchant', level: 40, diagnostics: { anniversaryVisit: { id: 'v1' }, anniversaryState: { stage: 'walking' } } })
  server.characters[0].diagnostics = { anniversaryState: { stage: 'kiss confirmed' } }
  server.extraState = {
    ...server.extraState,
    anniversaryAutoChat: true,
    anniversary: {
      slices: ['cake1', 'cake2'],
      labels: { cake1: 'Vanilla Slice', cake2: 'Berry Slice' },
      counts: { cake1: 3 },
      completeSets: 1,
      tradableNative: 2,
      missing: [],
      live: { target: 'Wizard', map: 'main', x: 10, y: -20, expires: Date.now() + 125_000 },
      eventCycle: { id: 'c1', startsAt: Date.now(), endsAt: Date.now() + 300_000, destination: { map: 'main', x: 0, y: 0, label: 'Bees' } },
      chatMessage: 'WTT cake slices',
      chatAdvertisement: null,
      activity: [
        { at: Date.now() - 2000, message: 'Leada kissed Wizard' },
        { at: Date.now() - 1000, message: 'Leada and received Berry Slice' },
      ],
    },
  }
  await server.install(page)
  const prefs = postBodies(page, 'dashboard-preferences')
  const chat = postBodies(page, 'anniversary/chat-advertise')

  await page.goto('/anniversary')
  const round = page.getByRole('region', { name: 'Anniversary round' })
  await expect(round.getByText('LIVE · Wizard')).toBeVisible()
  await expect(round.getByText(/^Expires in 2:0\d · main \[10, -20\]$/)).toBeVisible()
  await expect(round.getByText(/^Farming return failsafe in 4:\d\d · Bees$/)).toBeVisible()
  await expect(round.getByText('kiss confirmed')).toHaveClass(/text-emerald-300/)
  await expect(round.getByText('walking')).toHaveClass(/text-pink-300/)
  await expect(round.getByText('no ticket')).toBeVisible()

  const slices = page.getByRole('region', { name: 'Cake slices' })
  await expect(slices.getByText('Cake slices · 1 complete set(s)')).toBeVisible()
  await expect(slices.getByText('Berry Slice')).toBeVisible()
  await expect(slices.getByText('Tradable native surplus: 2')).toBeVisible()

  const activity = page.getByRole('region', { name: 'Anniversary activity' })
  await expect(activity.locator('div > div').first()).toContainText('received Berry Slice')
  await expect(activity.getByText(/received Berry Slice/)).toHaveClass(/text-emerald-300/)
  await expect(activity.getByText(/kissed Wizard/)).toHaveClass(/text-rose-300/)

  const autoChat = page.getByRole('checkbox', { name: 'Send chat advertisement when receiving cake from a kiss' })
  await expect(autoChat).toBeChecked()
  await autoChat.click()
  await expect.poll(() => prefs[0]).toEqual({ anniversaryAutoChat: false })
  await expect(autoChat).not.toBeChecked()

  const ad = page.getByRole('region', { name: 'Chat advertisement' })
  await expect(ad.getByText('WTT cake slices')).toBeVisible()
  await ad.getByRole('button', { name: 'Send in game chat' }).click()
  await expect.poll(() => chat.length).toBe(1)
})

test('Anniversary: chat advertisement is disabled without a message and shows the queued merchant', async ({ page }) => {
  const server = eventsServer()
  server.addCharacter({ name: 'Merchy', ctype: 'merchant', level: 40 })
  server.extraState = { ...server.extraState, anniversary: { slices: [], labels: {}, counts: {}, completeSets: 0, tradableNative: 0, missing: [], chatMessage: 'WTT', chatAdvertisement: { id: 'a', message: 'WTT', queuedAt: 1 } } }
  await server.install(page)
  await page.goto('/anniversary')
  await expect(page.getByRole('button', { name: 'Queued for Merchy' })).toBeDisabled()
  await expect(page.getByText('Waiting for the next round')).toBeVisible()
  await expect(page.getByText('Next round time unavailable')).toBeVisible()
  await expect(page.getByText('No anniversary activity yet.')).toBeVisible()
})
