import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// Console 1.5 (stable15-oct) small parity items from pwa-gap/GAPS.md.

function postBodies(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

function server() {
  const mock = new MockPartyServer()
  mock.paired = true
  return mock
}

test('G1 party gold: the total comes from core accountGold, offline slots included', async ({ page }) => {
  const mock = server()
  mock.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60, gold: 100 })
  mock.bankGold = 1000
  // An offline slot carries 5,000 more; party-gold.tsx reads state.accountGold first.
  mock.accountGold = { carried: 5100, total: 6100 }
  await mock.install(page)

  await page.goto('/')
  const gold = page.getByRole('button', { name: 'Party gold' })
  await expect(gold).toContainText('(6,100 total)')
  await gold.click()
  await expect(gold).toContainText('Bank: 1,000; carried: 5,100; combined: 6,100 gold')
})

test('G2 CC meter: code call cost out of 200, red from 180', async ({ page }) => {
  const mock = server()
  mock.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60, vitalsExtra: { cc: 185 } })
  await mock.install(page)

  await page.goto('/characters/Leada')
  const meter = page.getByRole('meter', { name: 'CC' })
  await expect(meter).toHaveAttribute('aria-valuenow', '185')
  await expect(meter).toHaveAttribute('aria-valuemax', '200')
  await expect(page.getByText('185 / 200')).toBeVisible()
  await expect(meter.locator('div')).toHaveCSS('background-color', 'rgb(127, 29, 29)')
})

test('G3 elixir slot: a countdown to expiry replaces the +level badge', async ({ page }) => {
  const mock = server()
  mock.addCatalogEntry({ id: 'elixirluck', name: 'Elixir of Luck' })
  mock.addCatalogEntry({ id: 'blade', name: 'Blade' })
  mock.addCharacter({
    name: 'Leada',
    ctype: 'warrior',
    level: 60,
    slots: { elixir: { item: { name: 'elixirluck', expires: new Date(Date.now() + 150_000).toISOString() } }, mainhand: { item: { name: 'blade', level: 3 } } },
  })
  await mock.install(page)

  await page.goto('/characters/Leada')
  // equip-slot.tsx shows the first unit of formatDuration(remaining).
  await expect(page.getByRole('button', { name: 'elixir: Elixir of Luck' })).toContainText(/^2m/)
  await expect(page.getByRole('button', { name: 'elixir: Elixir of Luck' })).not.toContainText('+0')
  await expect(page.getByRole('button', { name: 'mainhand: Blade' })).toContainText('+3')
})
