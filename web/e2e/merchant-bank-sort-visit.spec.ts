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
  return server
}

test('Merchant settings: "Leave gaps between item types" posts the bank sort layout and shows the saved one (bank-sort-control.tsx)', async ({ page }) => {
  const server = merchantServer()
  server.extraState = { bankSortMode: 'automatic', bankSortLayout: 'packed' }
  await server.install(page)
  const bodies = posts(page)

  await page.goto('/characters/Patinder')
  await page.getByRole('button', { name: 'Merchant settings' }).click()
  const gaps = page.getByRole('checkbox', { name: 'Leave gaps between item types' })
  await expect(gaps).not.toBeChecked()
  await expect(page.getByText(/^Each item category starts on its own row/)).toBeVisible()

  await gaps.click()
  await expect.poll(() => bodies.filter((b) => b.path === 'merchant/bank-sort').map((b) => b.body)).toEqual([{ layout: 'gapped' }])
  await expect(gaps).toBeChecked()
  expect(server.extraState.bankSortLayout).toBe('gapped')
  // The mode radio still sends only the mode.
  await page.getByRole('radio', { name: 'Request sorting in bank window' }).click()
  await expect.poll(() => bodies.filter((b) => b.path === 'merchant/bank-sort').at(-1)?.body).toEqual({ mode: 'request' })

  await gaps.click()
  await expect.poll(() => bodies.filter((b) => b.path === 'merchant/bank-sort').at(-1)?.body).toEqual({ layout: 'packed' })
  await expect(gaps).not.toBeChecked()

  server.failOnce['merchant/bank-sort'] = 'invalid bank sort setting'
  await gaps.click()
  await expect(page.getByRole('alert').filter({ hasText: 'invalid bank sort setting' })).toBeVisible()
  await expect(gaps).not.toBeChecked()
})

test('Send merchant to… offers "Visit bank", which queues a bank command for the merchant itself (merchant-visit-control.tsx)', async ({ page }) => {
  const server = merchantServer()
  await server.install(page)
  const bodies = posts(page)

  await page.goto('/characters/Patinder')
  await page.getByRole('button', { name: 'Send merchant to…' }).click()
  // Nobody else is online, but the bank visit is still offered.
  await expect(page.getByText('No other characters are online.')).toBeVisible()
  await page.getByRole('button', { name: 'Visit bank' }).click()
  await expect.poll(() => bodies.find((b) => b.path === 'command')?.body).toEqual({ character: 'Patinder', type: 'bank' })
  await expect(page.getByRole('status').filter({ hasText: 'Bank visit queued' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Visit bank' })).toHaveCount(0)

  server.failOnce['command'] = 'Merchant is busy'
  await page.getByRole('button', { name: 'Send merchant to…' }).click()
  await page.getByRole('button', { name: 'Visit bank' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Merchant is busy' })).toBeVisible()
})
