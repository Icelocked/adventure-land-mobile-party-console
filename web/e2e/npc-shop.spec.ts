import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// The console fork's Ponty/Ron shop: dashboard/features/party/npc-shop-dialog.tsx
// and runtime/coordinator/http/npc-shop-routes.ts in the live build
// (2db4d763). The npcShop and Ponty listing shapes follow a live
// section=market read from 2026-10-22.

function posts(page: Page): { path: string; body: Record<string, unknown> }[] {
  const bodies: { path: string; body: Record<string, unknown> }[] = []
  page.on('request', (request) => {
    const match = request.url().match(/\/party-api\/(npc-shop\/.+)$/)
    if (request.method() === 'POST' && match) bodies.push({ path: match[1], body: request.postDataJSON() as Record<string, unknown> })
  })
  return bodies
}

const listing = (rid: string, name: string, unitPrice: number, quantity: number, realm = ['US', 'III']) => ({
  key: `${realm.join(':')}:${rid}`,
  rid,
  item: { name, level: 0, rid },
  serverRegion: realm[0],
  serverIdentifier: realm[1],
  quantity,
  unitPrice,
  price: unitPrice * quantity,
  seenAt: Date.now(),
})

function shopServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCatalogEntry({ id: 'wbook0', name: 'Book of Wizardry' })
  server.pontyListings = [listing('a', 'wbook0', 500, 2), listing('b', 'wbook0', 400, 1), listing('c', 'blade', 90, 1, ['EU', 'I'])]
  server.npcShop = { orders: [], settings: { goldReserve: 0, ronDonation: false, ronVisitMinutes: 10 }, ron: null, merchantRealm: 'USIII', spendable: 1_250_000 }
  return server
}

test('Ponty / Ron is hidden on a console without the fork shop', async ({ page }) => {
  const server = shopServer()
  server.npcShop = undefined
  await server.install(page)
  await page.goto('/characters/Patinder')
  await expect(page.getByRole('button', { name: 'Buy', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ponty / Ron' })).toHaveCount(0)
})

test('Ponty: realm listings, a buy-X order, its progress and Stop, and the gold reserve', async ({ page }) => {
  const server = shopServer()
  await server.install(page)
  const bodies = posts(page)

  await page.goto('/characters/Patinder')
  await page.getByRole('button', { name: 'Ponty / Ron' }).click()
  const shop = page.getByRole('dialog', { name: 'Ponty and Ron' })
  await expect(shop.getByText("What Ponty and Ron sell on the merchant's realm (USIII).", { exact: false })).toBeVisible()
  await expect(shop.getByText('Spendable now: 1,250,000g.', { exact: false })).toBeVisible()
  // The EU listing is on another realm.
  await expect(shop.getByText('blade')).toHaveCount(0)
  await expect(shop.getByText('3 available · 400g each')).toBeVisible()

  await shop.getByRole('spinbutton', { name: 'Quantity for Book of Wizardry' }).fill('2')
  await shop.getByRole('spinbutton', { name: 'Max unit price for Book of Wizardry' }).fill('450')
  await shop.getByRole('button', { name: 'Buy 2 Book of Wizardry' }).click()
  await expect.poll(() => bodies[0]).toEqual({ path: 'npc-shop/orders', body: { npc: 'ponty', item: 'wbook0', level: 0, mode: 'count', quantity: 2, maxUnitPrice: 450 } })
  const orders = shop.getByRole('region', { name: 'Orders' })
  await expect(orders.getByText('Book of Wizardry · buy 2 ≤ 450g')).toBeVisible()
  await expect(orders.getByText('0/2 bought · 0g · active')).toBeVisible()

  await orders.getByRole('button', { name: 'Stop Book of Wizardry order' }).click()
  await expect.poll(() => bodies[1]?.path).toBe('npc-shop/stop')
  expect(bodies[1].body).toEqual({ id: (server.npcShop!.orders as { id: string }[])[0].id })
  await expect(orders.getByText('0/2 bought · 0g · stopped')).toBeVisible()
  await expect(orders.getByRole('button', { name: /^Stop / })).toHaveCount(0)

  await shop.getByRole('spinbutton', { name: 'Gold reserve' }).fill('5000')
  await shop.getByRole('button', { name: 'Save reserve' }).click()
  await expect.poll(() => bodies[2]).toEqual({ path: 'npc-shop/settings', body: { goldReserve: 5000 } })
  await expect(shop.getByRole('spinbutton', { name: 'Gold reserve' })).toHaveValue('5000')
})

test('Ron: donation consent, visit interval, Check Ron now, buy all, and a 409 without a merchant', async ({ page }) => {
  const server = shopServer()
  await server.install(page)
  const bodies = posts(page)

  await page.goto('/characters/Patinder')
  await page.getByRole('button', { name: 'Ponty / Ron' }).click()
  const shop = page.getByRole('dialog', { name: 'Ponty and Ron' })
  await shop.getByRole('tab', { name: 'Ron' }).click()
  await expect(shop.getByText('Check Ron to read his stock.')).toBeVisible()
  await expect(shop.getByText('Not read since the console started')).toBeVisible()

  await shop.getByRole('checkbox', { name: /Allow a 1,000,000 gold donation/ }).check()
  await expect.poll(() => bodies[0]).toEqual({ path: 'npc-shop/settings', body: { ronDonation: true } })
  await expect(shop.getByRole('checkbox', { name: /Allow a 1,000,000 gold donation/ })).toBeChecked()

  const minutes = shop.getByRole('spinbutton', { name: 'Ron visit minutes' })
  await minutes.fill('30')
  await minutes.blur()
  await expect.poll(() => bodies[1]).toEqual({ path: 'npc-shop/settings', body: { ronVisitMinutes: 30 } })

  server.npcShop = { ...server.npcShop!, ron: { listings: [listing('r', 'wbook0', 2000, 1)], updatedAt: Date.now(), error: null } }
  await shop.getByRole('button', { name: 'Check Ron now' }).click()
  await expect.poll(() => bodies[2]).toEqual({ path: 'npc-shop/ron-visit', body: {} })
  await expect(shop.getByText(/^Read \d/)).toBeVisible()
  await shop.getByRole('button', { name: 'Buy all Book of Wizardry' }).click()
  await expect.poll(() => bodies[3]).toEqual({ path: 'npc-shop/orders', body: { npc: 'ron', item: 'wbook0', level: 0, mode: 'all', quantity: 1, maxUnitPrice: 2000 } })
  await expect(shop.getByRole('region', { name: 'Orders' }).getByText('Book of Wizardry · buy all ≤ 2,000g')).toBeVisible()

  server.merchantCharacter = null
  await shop.getByRole('button', { name: 'Check Ron now' }).click()
  await expect(shop.getByRole('alert')).toHaveText('configure a merchant first')
})
