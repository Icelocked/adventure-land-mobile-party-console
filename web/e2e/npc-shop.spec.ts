import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// The console fork's Watch list: dashboard/features/party/npc-shop-dialog.tsx
// and runtime/coordinator/http/npc-shop-routes.ts on topic15/ponty-ron-buys.
// Prices follow commerce/npc-price.ts (calculate_item_value times 2 for
// Ponty, 4 for Ron).

function posts(page: Page): { path: string; body: Record<string, unknown> }[] {
  const bodies: { path: string; body: Record<string, unknown> }[] = []
  page.on('request', (request) => {
    const match = request.url().match(/\/party-api\/(npc-shop\/.+)$/)
    if (request.method() === 'POST' && match) bodies.push({ path: match[1], body: request.postDataJSON() as Record<string, unknown> })
  })
  return bodies
}

function shopServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCatalogEntry({ id: 'wbook0', name: 'Book of Wizardry', value: 1000, upgradeable: true, definition: { upgrade: {} } })
  server.addCatalogEntry({ id: 'scroll0', name: 'Upgrade Scroll', value: 1000 })
  server.npcShop = { orders: [], settings: { goldReserve: 0, ronDonation: false, ronVisitMinutes: 10 }, ron: null, merchantRealm: 'USIII', spendable: 1_250_000 }
  return server
}

test('Watch list is hidden on a console without the fork shop', async ({ page }) => {
  const server = shopServer()
  server.npcShop = undefined
  await server.install(page)
  await page.goto('/characters/Patinder')
  await expect(page.getByRole('button', { name: 'Buy', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Watch list' })).toHaveCount(0)
})

test('a watch shows prices per level and totals, then Stop and Resume', async ({ page }) => {
  const server = shopServer()
  await server.install(page)
  const bodies = posts(page)
  await page.goto('/characters/Patinder')
  await page.getByRole('button', { name: 'Watch list' }).click()
  const watch = page.getByRole('dialog', { name: 'Watch list' })
  await expect(watch.getByText('Spendable 1,250,000g')).toBeVisible()

  await watch.getByRole('combobox', { name: 'Watch item' }).fill('Book of Wizardry')
  await watch.getByRole('spinbutton', { name: 'Highest level' }).fill('1')
  await expect(watch.getByText('+0 · Ponty 1,200g · Ron 2,400g')).toBeVisible()
  await expect(watch.getByText('+1 · Ponty 2,200g · Ron 4,400g')).toBeVisible()
  await watch.getByRole('spinbutton', { name: 'Quantity' }).fill('300')
  await expect(watch.getByText('Estimated total 360,000 to 660,000g')).toBeVisible()
  await watch.getByRole('checkbox', { name: 'Until I stop' }).check()
  await expect(watch.getByText('1,200 to 2,200g per copy')).toBeVisible()
  await watch.getByRole('spinbutton', { name: 'Spend cap' }).fill('50000')
  await watch.getByRole('button', { name: 'Add watch' }).click()
  await expect.poll(() => bodies[0]).toEqual({ path: 'npc-shop/orders', body: { npc: 'ponty', kind: 'watch', item: 'wbook0', levelMin: 0, levelMax: 1, quantity: null, spendCap: 50000 } })
  const list = watch.getByRole('region', { name: 'Watches' })
  await expect(list.getByText('Book of Wizardry +0 to +1 · Ponty · watch · cap 50,000g')).toBeVisible()
  await expect(list.getByText('0 (until stopped) bought · 0g spent · active')).toBeVisible()

  await list.getByRole('button', { name: 'Stop Book of Wizardry watch' }).click()
  await expect.poll(() => bodies[1]).toEqual({ path: 'npc-shop/stop', body: { id: (server.npcShop!.orders as { id: string }[])[0].id } })
  await expect(list.getByText('0 (until stopped) bought · 0g spent · paused')).toBeVisible()
  await list.getByRole('button', { name: 'Resume Book of Wizardry watch' }).click()
  await expect.poll(() => bodies[2]?.path).toBe('npc-shop/resume')
  await expect(list.getByText('0 (until stopped) bought · 0g spent · active')).toBeVisible()

  await watch.getByRole('spinbutton', { name: 'Gold reserve' }).fill('5000')
  await watch.getByRole('button', { name: 'Save reserve' }).click()
  await expect.poll(() => bodies[3]).toEqual({ path: 'npc-shop/settings', body: { goldReserve: 5000 } })
})

test('Ron: consent, interval, Check Ron now, filtered stock, buy now and a 409 without a merchant', async ({ page }) => {
  const server = shopServer()
  await server.install(page)
  const bodies = posts(page)
  await page.goto('/characters/Patinder')
  await page.getByRole('button', { name: 'Watch list' }).click()
  const watch = page.getByRole('dialog', { name: 'Watch list' })
  await watch.getByRole('tab', { name: 'Ron' }).click()
  await expect(watch.getByText('Check Ron to read his stock.')).toBeVisible()

  await watch.getByRole('checkbox', { name: /Allow a 1,000,000 gold donation/ }).check()
  await expect.poll(() => bodies[0]).toEqual({ path: 'npc-shop/settings', body: { ronDonation: true } })
  const minutes = watch.getByRole('spinbutton', { name: 'Ron visit minutes' })
  await minutes.fill('30')
  await minutes.blur()
  await expect.poll(() => bodies[1]).toEqual({ path: 'npc-shop/settings', body: { ronVisitMinutes: 30 } })

  const offer = (rid: string, name: string, unitPrice: number, firstSeenAt: number) => ({ rid, item: { name, level: 0, rid }, quantity: 1, unitPrice, price: unitPrice, firstSeenAt })
  server.npcShop = { ...server.npcShop!, ron: { listings: [offer('r', 'wbook0', 2400, Date.now() - 5000), offer('s', 'scroll0', 2400, Date.now())], updatedAt: Date.now(), error: null } }
  await watch.getByRole('button', { name: 'Check Ron now' }).click()
  await expect.poll(() => bodies[2]).toEqual({ path: 'npc-shop/ron-visit', body: {} })
  await expect(watch.getByText(/^Visited \d/)).toBeVisible()
  await expect(watch.getByText('1 available · 2,400g each')).toHaveCount(2)
  await watch.getByRole('textbox', { name: 'Keywords' }).fill('wizardry')
  await expect(watch.getByText('1 available · 2,400g each')).toHaveCount(1)
  await watch.getByRole('button', { name: 'Buy 1 now Book of Wizardry' }).click()
  await expect.poll(() => bodies[3]).toEqual({ path: 'npc-shop/orders', body: { npc: 'ron', kind: 'now', item: 'wbook0', levelMin: 0, levelMax: 0, quantity: 1, spendCap: null } })

  server.merchantCharacter = null
  await watch.getByRole('button', { name: 'Check Ron now' }).click()
  await expect(watch.getByRole('alert')).toHaveText('configure a merchant first')
})
