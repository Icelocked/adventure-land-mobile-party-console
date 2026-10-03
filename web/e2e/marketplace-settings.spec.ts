import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Marketplace settings: auto stand buys, blacklist toggle, manual block, per-record and two-step Clear all', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.extraState = {
    autoStandBuys: false,
    autoBlacklistMerchants: true,
    merchantBlacklist: { 'Flaky|US|I': { seller: 'Flaky', serverRegion: 'US', serverIdentifier: 'I', reason: 'unavailable', failures: 3, until: Date.now() + 5 * 60000, updatedAt: 1 } },
  }
  await server.install(page)

  await page.goto('/market')
  await page.getByRole('button', { name: 'Marketplace settings' }).click()
  await expect(page).toHaveURL(/\/market\/settings/)
  const strike = page.getByRole('group', { name: 'Strike Flaky' })
  await expect(strike.getByText(/US I · unavailable · 3 strikes · 5m until retry/)).toBeVisible()

  await page.getByRole('checkbox', { name: 'Automatically fill empty stand slots with highest priority buy order' }).click()
  await expect.poll(() => server.extraState.autoStandBuys).toBe(true)
  await page.getByRole('checkbox', { name: 'Enable blacklisting unavailable merchants' }).click()
  await expect.poll(() => server.extraState.autoBlacklistMerchants).toBe(false)

  await page.getByLabel('Merchant name').fill('Scammer')
  await page.getByLabel('Minutes').fill('0')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('alert')).toHaveText('duration must be minutes or -1 for forever')
  await page.getByLabel('Minutes').fill('-1')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('group', { name: 'Strike Scammer' }).getByText(/all regions all servers · manual · 0 strikes · blocked forever/)).toBeVisible()
  await expect(page.getByLabel('Merchant name')).toHaveValue('')

  await strike.getByRole('button', { name: 'Clear' }).click()
  await expect(page.getByRole('group', { name: 'Strike Flaky' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear all' }).click()
  await page.getByRole('button', { name: 'Really clear all?' }).click()
  await expect(page.getByText('No merchant strike records.')).toBeVisible()
})
