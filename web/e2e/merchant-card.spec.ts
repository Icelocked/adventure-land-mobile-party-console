import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function posts(page: Page): { path: string; body: Record<string, unknown> }[] {
  const bodies: { path: string; body: Record<string, unknown> }[] = []
  page.on('request', (request) => {
    const match = request.url().match(/\/party-api\/(.+)$/)
    if (request.method() === 'POST' && match) bodies.push({ path: match[1], body: request.postDataJSON() as Record<string, unknown> })
  })
  return bodies
}

function merchantServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  return server
}

test('Merchant logistics: empty queue, priority prefixes, labels, retry only once realm retries are exhausted, mluck upkeep', async ({ page }) => {
  const server = merchantServer()
  server.merchantRoutinePriorities = { restock: 90 }
  await server.install(page)

  await page.goto('/characters/Patinder')
  await expect(page.getByText('No queued work')).toBeVisible()

  server.merchantQueue = [
    { id: 'j1', target: 'Ranger1', reason: 'restock', realmBlockedReason: 'realm busy' },
    { id: 'j2', target: 'Ranger1', reason: 'npc sales', priority: 77, realmRetryExhausted: true },
  ]
  server.extraState = { mluckSchedule: { target: 'Ranger1', remainingMs: 1000, leadMs: 0, dispatchInMs: 125_000, marginMs: 0, status: 'scheduled' } }
  await expect(page.getByText('P90')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Party restock · Ranger1')).toBeVisible()
  await expect(page.getByText('realm busy')).toBeVisible()
  await expect(page.getByText('P77')).toBeVisible()
  await expect(page.getByText('NPC sales · Ranger1')).toBeVisible()
  // Only the exhausted job offers Retry.
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(1)
  await expect(page.getByText(/Merchant's Luck upkeep · Ranger1/)).toBeVisible()
  await expect(page.getByText('dispatch in 2m 5s')).toBeVisible()
})

test('Merchant activity: newest first, and Clear stale orders reports what it removed', async ({ page }) => {
  const server = merchantServer()
  server.merchantActivity = [
    { at: Date.now() - 60_000, message: 'Older entry', level: 'info' },
    { at: Date.now(), message: 'Newest entry', level: 'error', details: 'boom' },
  ]
  await server.install(page)
  await page.route('**/party-api/merchant/stale-orders/clear', (route) => route.fulfill({ json: { ok: true, deliveriesRemoved: 2, bankMarksRemoved: 1 } }))

  await page.goto('/characters/Patinder')
  await page.getByText('Activity', { exact: true }).click()
  const lines = page.locator('p', { hasText: /entry/ })
  await expect(lines.first()).toContainText(/Newest entry\s*— boom/)
  await page.getByRole('button', { name: 'Clear stale orders' }).click()
  await expect(page.getByText('Removed 2 deliveries, 1 bank marks')).toBeVisible()
})

test('Donate shows the XP preview and validates; Join giveaway picks a realm and an online player', async ({ page }) => {
  const server = merchantServer()
  server.extraState = { giveawayRealms: [{ key: 'EUI', label: 'EU I' }], giveawayPlayers: { EUI: ['Generous', 'Other'] } }
  await server.install(page)
  const bodies = posts(page)

  await page.goto('/characters/Patinder')
  await page.getByRole('button', { name: 'Donate gold' }).click()
  await page.getByRole('textbox', { name: 'Donation amount' }).fill('1000')
  await expect(page.getByText('Preview: 3,200 XP')).toBeVisible()
  await page.getByRole('button', { name: 'Donate', exact: true }).click()
  await expect.poll(() => bodies.find((b) => b.path === 'merchant/donate')?.body).toEqual({ amount: 1000 })

  await page.getByRole('button', { name: 'Join giveaway' }).click()
  await page.getByRole('combobox', { name: 'Server realm' }).selectOption('EUI')
  await expect(page.getByText('2 online players loaded')).toBeVisible()
  await page.getByPlaceholder('Search player name…').fill('gen')
  await page.getByRole('button', { name: 'Generous' }).click()
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  await expect.poll(() => bodies.find((b) => b.path === 'merchant/join-giveaway')?.body).toEqual({ seller: 'Generous', realm: 'EUI' })
})

test('Send merchant to… queues a visit to an online character; map travel is "Travel to place…"', async ({ page }) => {
  const server = merchantServer()
  await server.install(page)
  const bodies = posts(page)

  await page.goto('/characters/Patinder')
  await expect(page.getByRole('button', { name: 'Travel to place…' })).toBeVisible()
  await page.getByRole('button', { name: 'Send merchant to…' }).click()
  await page.getByRole('button', { name: 'Ranger1', exact: true }).click()
  await expect.poll(() => bodies.find((b) => b.path === 'command')?.body).toEqual({ character: 'Ranger1', type: 'bank' })
  await expect(page.getByText('Merchant visit queued for Ranger1')).toBeVisible()
})

test('Send to party: with more than one group, choose the group', async ({ page }) => {
  const server = merchantServer()
  server.addCharacter({ name: 'Solo', ctype: 'mage', level: 40 })
  server.leader = 'Ranger1'
  await server.install(page)
  const bodies = posts(page)

  await page.goto('/characters/Patinder')
  await page.getByRole('button', { name: 'Send to party' }).click()
  await page.getByRole('button', { name: 'Solo', exact: true }).click()
  await expect.poll(() => bodies.find((b) => b.path === 'bank-party')?.body).toEqual({ group: 'Solo' })
})
