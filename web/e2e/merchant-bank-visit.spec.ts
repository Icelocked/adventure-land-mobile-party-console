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
