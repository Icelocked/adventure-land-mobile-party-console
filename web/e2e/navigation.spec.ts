import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Account menu is reachable from home with no character online, and shows the mail count', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.mailMessages = [{ id: 'mail-1', from: 'Someone', subject: 'Hi', taken: false }]
  await server.install(page)

  await page.goto('/')
  await page.getByRole('button', { name: 'Menu' }).click()
  await expect(page.getByRole('button', { name: 'Mail (1)' })).toBeVisible()
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('button', { name: 'Change server address' })).toBeVisible()
})

test('Account menu includes Merchant routines and WTB orders', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  await server.install(page)

  await page.goto('/')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('button', { name: 'Merchant routines' }).click()
  await expect(page).toHaveURL(/\/routines$/)
})
