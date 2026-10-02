import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Merchant logistics: a job stuck retrying the same error for many attempts shows a clear stuck warning, not just a silent retry', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.merchantCurrent = {
    id: 'merchant-1',
    target: 'Sadokunn',
    reason: 'inventory cleanout',
    lastDeferredReason: "Couldn't use lucky slot: displaced item changed; inventory recovery required",
    firstDeferredAt: Date.now() - 5 * 60_000,
    recoveryAttempts: 36,
  }
  await server.install(page)

  await page.goto('/characters/Patinder')
  await expect(page.getByText(/Stuck:.*lucky slot/i)).toBeVisible()
  await expect(page.getByText(/retried 36×/)).toBeVisible()
})

test('Merchant logistics: a freshly-deferred job (a couple retries, just started) does not show the stuck warning', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.merchantCurrent = {
    id: 'merchant-2',
    target: 'Sadokunn',
    reason: 'restock',
    lastDeferredReason: 'realm busy',
    firstDeferredAt: Date.now() - 5_000,
    recoveryAttempts: 1,
  }
  await server.install(page)

  await page.goto('/characters/Patinder')
  await expect(page.getByText(/Now: restock/)).toBeVisible()
  await expect(page.getByText(/Stuck:/)).not.toBeVisible()
})
