import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// Console 1.4 merchant and market features, request bodies checked against
// the dashboard at 50c4cb0 (stand-sheet.tsx, market-preferences.tsx,
// lucky-slot-tracker.tsx, inventory-panel.tsx, merchant-card-controls.tsx,
// upgrade-actions.tsx).

function postBodies(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

const fresh = () => Date.now() + 600_000
const listing = (key: string, fields: Record<string, unknown>) => ({
  key,
  source: 'aldata',
  seller: 'Seller1',
  serverRegion: 'US',
  serverIdentifier: 'I',
  map: 'main',
  seenAt: fresh(),
  item: { name: 'ironore', level: 0 },
  price: 40,
  quantity: 3,
  ...fields,
})
const marketServer = () => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'wcoat', level: 0 }] })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore', value: 100 })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat', value: 1000 })
  return server
}

test.describe('Market ignored items', () => {
  test('ignoring a listing posts its identity, hides it, and the settings list removes and clears entries', async ({ page }) => {
    const server = marketServer()
    server.extraState = {
      aldata: { auth: 'CORRECT', merchantsUpdatedAt: 1, listings: [listing('a', {}), listing('c', { seller: 'Seller2', item: { name: 'wcoat', level: 0 }, price: 900, quantity: 1 })] },
    }
    await server.install(page)
    const bodies = postBodies(page, 'market/ignored-items')

    await page.goto('/market')
    const ore = page.getByRole('group', { name: 'WTS Iron Ore from Seller1' })
    await ore.getByRole('button', { name: 'Ignore listings of Iron Ore' }).click()
    await expect.poll(() => bodies.length).toBe(1)
    // stand-sheet.tsx updateIgnored spreads the listing item and forces level.
    expect(bodies[0]).toEqual({ action: 'add', name: 'ironore', level: 0 })
    await expect(ore).toHaveCount(0)
    await expect(page.getByRole('group', { name: 'WTS Wolf Coat from Seller2' })).toBeVisible()

    await page.goto('/market/settings')
    const section = page.getByRole('region', { name: 'Ignored items' })
    await expect(section).toContainText('(1)')
    // Collapsed by default, like market-preferences.tsx.
    await expect(section.getByText('Iron Ore')).toHaveCount(0)
    await section.getByRole('button', { name: 'Ignored items', exact: true }).click()
    await section.getByRole('button', { name: 'Remove Iron Ore from ignored items' }).click()
    await expect.poll(() => bodies.length).toBe(2)
    expect(bodies[1]).toEqual({ action: 'remove', name: 'ironore', level: 0 })
    await expect(section.getByText('No ignored items.')).toBeVisible()
    await expect(section.getByRole('button', { name: 'Clear all ignored items' })).toBeDisabled()

    server.extraState = { ...server.extraState, marketIgnoredItems: [{ name: 'wcoat', level: 2 }, { name: 'ironore', level: 0 }] }
    await page.reload()
    await expect(section).toContainText('(2)')
    await section.getByRole('button', { name: 'Ignored items', exact: true }).click()
    await expect(section.getByText('Wolf Coat +2')).toBeVisible()
    await section.getByRole('button', { name: 'Clear all ignored items' }).click()
    await expect.poll(() => bodies.length).toBe(3)
    expect(bodies[2]).toEqual({ action: 'clear', level: 0 })
    await expect(section).toContainText('(0)')
  })

  test('an ignore the server refuses shows its error and keeps the listing', async ({ page }) => {
    const server = marketServer()
    server.extraState = { aldata: { auth: 'CORRECT', merchantsUpdatedAt: 1, listings: [listing('a', {})] } }
    server.failOnce['market/ignored-items'] = 'The ignored-item list is full; remove an entry first'
    await server.install(page)

    await page.goto('/market')
    const ore = page.getByRole('group', { name: 'WTS Iron Ore from Seller1' })
    await ore.getByRole('button', { name: 'Ignore listings of Iron Ore' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'The ignored-item list is full; remove an entry first' })).toBeVisible()
    await expect(ore).toBeVisible()
  })

  test('ignored items stay hidden on every tab; Hide stale listings is per tab and remembered', async ({ page }) => {
    const server = marketServer()
    server.extraState = {
      marketIgnoredItems: [{ name: 'ironore', level: 0 }],
      aldata: {
        auth: 'CORRECT',
        merchantsUpdatedAt: 1,
        listings: [listing('a', {}), listing('c', { seller: 'Seller2', item: { name: 'wcoat', level: 0 }, price: 900, quantity: 1, seenAt: 1 })],
        buyOrders: [
          { key: 'w1', buyer: 'Buyer1', serverRegion: 'US', serverIdentifier: 'I', map: 'main', seenAt: fresh(), price: 30, quantity: 5, item: { name: 'ironore', level: 0 } },
          { key: 'w2', buyer: 'Buyer2', serverRegion: 'US', serverIdentifier: 'I', map: 'main', seenAt: 1, price: 900, quantity: 1, item: { name: 'wcoat', level: 0 } },
        ],
      },
    }
    await server.install(page)

    await page.goto('/market')
    await expect(page.getByRole('group', { name: 'WTS Iron Ore from Seller1' })).toHaveCount(0)
    const staleCoat = page.getByRole('group', { name: 'WTS Wolf Coat from Seller2' })
    await expect(staleCoat).toBeVisible()
    await page.getByRole('checkbox', { name: 'Hide stale listings' }).check()
    await expect(staleCoat).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('checkbox', { name: 'Hide stale listings' })).toBeChecked()
    await expect(page.getByRole('group', { name: 'WTS Wolf Coat from Seller2' })).toHaveCount(0)

    await page.getByRole('tab', { name: /Live WTB/ }).click()
    await expect(page.getByRole('checkbox', { name: 'Hide stale listings' })).not.toBeChecked()
    await expect(page.getByRole('group', { name: 'WTB Iron Ore from Buyer1' })).toHaveCount(0)
    await expect(page.getByRole('group', { name: 'WTB Wolf Coat from Buyer2' })).toBeVisible()
  })
})

test.describe('ALData Check for stale listings', () => {
  test('a stale WTS listing offers Check, which buys with check: true after confirming', async ({ page }) => {
    const server = marketServer()
    server.extraState = {
      aldata: { auth: 'CORRECT', merchantsUpdatedAt: 1, listings: [listing('c', { seller: 'Seller2', item: { name: 'wcoat', level: 0 }, price: 5000, quantity: 1, seenAt: 1 })] },
    }
    await server.install(page)
    const bodies = postBodies(page, 'merchant/aldata-order')

    await page.goto('/market')
    const coat = page.getByRole('group', { name: 'WTS Wolf Coat from Seller2' })
    await expect(coat.getByRole('button', { name: 'Buy' })).toHaveCount(0)
    await expect(coat.getByRole('button', { name: 'Make WTB' })).toBeVisible()
    await coat.getByRole('button', { name: 'Check' }).click()
    const confirm = coat.getByRole('group', { name: 'Check stale listing' })
    await expect(confirm).toContainText(
      "Send the merchant to check whether Seller2's listing for Wolf Coat is still live, and buy up to 1 for 5,000g each if so? If the listing is gone, this fails safely and reports back in merchant activity.",
    )
    await confirm.getByRole('button', { name: 'Yes' }).click()
    await expect.poll(() => bodies.length).toBe(1)
    expect((bodies[0].listing as { key: string }).key).toBe('c')
    expect(bodies[0].buyQuantity).toBe(1)
    expect(bodies[0].check).toBe(true)
    await expect(confirm).toHaveCount(0)
  })

  test('a Check the server refuses keeps the confirmation open with its error', async ({ page }) => {
    const server = marketServer()
    server.extraState = {
      aldata: { auth: 'CORRECT', merchantsUpdatedAt: 1, listings: [listing('c', { seller: 'Seller2', item: { name: 'wcoat', level: 0 }, price: 5000, quantity: 1, seenAt: 1 })] },
    }
    server.failOnce['merchant/aldata-order'] = 'ALData listing is no longer in the market snapshot'
    await server.install(page)

    await page.goto('/market')
    const coat = page.getByRole('group', { name: 'WTS Wolf Coat from Seller2' })
    await coat.getByRole('button', { name: 'Check' }).click()
    const confirm = coat.getByRole('group', { name: 'Check stale listing' })
    await confirm.getByRole('button', { name: 'Yes' }).click()
    await expect(confirm.getByRole('alert')).toHaveText('ALData listing is no longer in the market snapshot')
  })

  test('a stale WTB offer for an owned item offers Check and List; Check sells with check: true', async ({ page }) => {
    const server = marketServer()
    server.extraState = {
      aldata: {
        auth: 'CORRECT',
        merchantsUpdatedAt: 1,
        buyOrders: [{ key: 'w1', buyer: 'Buyer1', serverRegion: 'US', serverIdentifier: 'I', map: 'main', seenAt: 1, price: 900, quantity: 2, item: { name: 'wcoat', level: 0 } }],
      },
    }
    await server.install(page)
    const bodies = postBodies(page, 'merchant/aldata-sale')

    await page.goto('/market')
    await page.getByRole('tab', { name: /Live WTB/ }).click()
    const offer = page.getByRole('group', { name: 'WTB Wolf Coat from Buyer1' })
    await expect(offer.getByRole('button', { name: 'Sell' })).toHaveCount(0)
    await expect(offer.getByRole('button', { name: 'List', exact: true })).toBeVisible()
    await offer.getByRole('button', { name: 'Check' }).click()
    const confirm = offer.getByRole('group', { name: 'Check stale WTB listing' })
    await expect(confirm).toContainText("Send the merchant to check whether Buyer1's WTB listing for Wolf Coat is still live, and sell up to 1 for 900g each if so?")
    await confirm.getByRole('button', { name: 'Yes' }).click()
    await expect.poll(() => bodies.length).toBe(1)
    expect((bodies[0].order as { key: string }).key).toBe('w1')
    expect(bodies[0].sellQuantity).toBe(1)
    expect(bodies[0].check).toBe(true)
  })
})

test.describe('Lucky slot position lock and sequential discovery', () => {
  const luckyServer = () => {
    const server = new MockPartyServer()
    server.paired = true
    server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
    return server
  }

  test('the next slot follows the cursor instead of the least-sampled slot', async ({ page }) => {
    const server = luckyServer()
    // One roll in slot 7: console 1.3 would test slot 0 next, 1.4 tests slot 8.
    const stream = { version: 1 as const, cursor: { slot: 8, at: 1000, rolls: 1 }, slots: { '7': { totalRolls: 1, sumRolls: 0.9999, rollsAbove96_3: 1, perfectRolls: 0 } } }
    server.luckySlotTracking = { Merchantina: { 'stream-1': stream } }
    await server.install(page)

    await page.goto('/characters/Merchantina')
    await expect(page.getByRole('button', { name: 'Next upgrade will test for lucky upgrade, slot 8. Open lucky slot options' })).toBeVisible()
    await expect(page.getByText('Next upgrade will test for lucky upgrade · slot 8 (inventory position 9).')).toBeVisible()
  })

  test('Lock and Unlock post merchant/config; the lock pins the position and unlock resumes at the next square', async ({ page }) => {
    const server = luckyServer()
    await server.install(page)
    const bodies = postBodies(page, 'merchant/config')

    await page.goto('/characters/Merchantina')
    await page.getByRole('region', { name: 'Lucky upgrade slot' }).getByRole('button', { name: 'Show lucky slot data' }).click()
    await page.getByRole('button', { name: 'Lock lucky slot position · slot 3', exact: true }).click()
    await expect.poll(() => bodies.length).toBe(1)
    expect(bodies[0]).toEqual({ character: 'Merchantina', slot: 3, action: 'lock-lucky-slot' })
    await expect(page.getByRole('dialog').getByText('Locked slot: 3. Rolls continue to accumulate in this position.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Lock lucky slot position · slot 4', exact: true })).toBeDisabled()
    await expect(page.locator('tr[data-slot="3"]')).toContainText('Locked')

    await page.getByRole('button', { name: 'Unlock lucky slot position · slot 3', exact: true }).click()
    await expect.poll(() => bodies.length).toBe(2)
    // connected-inventory.tsx sends the row's slot on unlock too.
    expect(bodies[1]).toEqual({ character: 'Merchantina', slot: 3, action: 'unlock-lucky-slot' })
    await expect(page.getByRole('dialog').getByText('Next upgrade will test for lucky upgrade · slot 4 (inventory position 5).')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Lock lucky slot position · slot 4', exact: true })).toBeEnabled()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Next upgrade will test for lucky upgrade, slot 4. Open lucky slot options' })).toBeVisible()
  })

  test('a locked position labels the inventory square and outranks a verified slot', async ({ page }) => {
    const server = luckyServer()
    server.luckyUpgradeSlots = { Merchantina: 5 }
    server.extraState = { luckySlotLocks: { Merchantina: 2 } }
    await server.install(page)

    await page.goto('/characters/Merchantina')
    await expect(page.getByRole('button', { name: 'Locked lucky upgrade position, slot 2. Open lucky slot options' })).toBeVisible()
    await expect(page.getByText('Locked slot: 2. Rolls continue to accumulate in this position.')).toBeVisible()
  })

  test('a refused unlock leaves the lock in place', async ({ page }) => {
    const server = luckyServer()
    server.extraState = { luckySlotLocks: { Merchantina: 2 } }
    server.failOnce['merchant/config'] = 'lucky slot is not locked'
    await server.install(page)

    await page.goto('/characters/Merchantina')
    await page.getByRole('region', { name: 'Lucky upgrade slot' }).getByRole('button', { name: 'Show lucky slot data' }).click()
    await page.getByRole('button', { name: 'Unlock lucky slot position · slot 2', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'lucky slot is not locked' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Unlock lucky slot position · slot 2', exact: true })).toBeVisible()
  })

  test('ruled-out slots are counted, marked, and skipped', async ({ page }) => {
    const server = luckyServer()
    // Console e2e lucky-slot-elimination.spec.ts ledger.
    server.luckySlotTracking = {
      Merchantina: {
        'e2e-elimination': {
          version: 1,
          slots: Object.fromEntries(Array.from({ length: 42 }, (_, slot) => [String(slot), { totalRolls: 100, sumRolls: slot === 0 ? 60 : 50, rollsAbove96_3: slot === 0 ? 20 : 3, perfectRolls: 0 }])),
        },
      },
    }
    await server.install(page)

    await page.goto('/characters/Merchantina')
    await page.getByRole('region', { name: 'Lucky upgrade slot' }).getByRole('button', { name: 'Show lucky slot data' }).click()
    await expect(page.getByText('1/42 slots ruled out.')).toBeVisible()
    await expect(page.locator('tr[data-slot="0"]')).toContainText('Ruled out')
    await expect(page.getByRole('dialog').getByText(/Next upgrade will test for lucky upgrade · slot 1 /)).toBeVisible()
  })
})

test.describe('One-off Exchange', () => {
  const exchangeServer = () => {
    const server = new MockPartyServer()
    server.paired = true
    server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
    server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50, items: [{ name: 'gem0', q: 3 }] })
    server.addCatalogEntry({ id: 'gem0', name: 'Green Gem', definition: { e: 1 } })
    server.exchangeable = [{ key: 'gem0@0', id: 'gem0', level: 0, name: 'Green Gem', cost: 0, required: 1, results: [] }]
    return server
  }

  test("a party member's exchangeable item offers Exchange, which posts command exchange and queues a pickup", async ({ page }) => {
    const server = exchangeServer()
    await server.install(page)
    const bodies = postBodies(page, 'command')

    await page.goto('/characters/Ranger1')
    await page.getByTestId('inventory-slot-0').click()
    await expect(page.getByRole('button', { name: 'Auto exchange', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Exchange', exact: true }).click()
    await expect.poll(() => bodies.length).toBe(1)
    expect(bodies[0]).toEqual({ type: 'exchange', character: 'Ranger1', item: { name: 'gem0', q: 3 }, slot: 0 })
    await expect(page.getByRole('button', { name: 'Exchange', exact: true })).toHaveCount(0)
    expect(server.merchantQueue.map((job) => [job.reason, job.target])).toEqual([
      ['exchange pickup', 'Ranger1'],
      ['exchange', 'Patinder'],
    ])
  })

  test('a refused Exchange keeps the options open with the error', async ({ page }) => {
    const server = exchangeServer()
    server.failOnce['command'] = 'this item is protected or reserved'
    await server.install(page)

    await page.goto('/characters/Ranger1')
    await page.getByTestId('inventory-slot-0').click()
    await page.getByRole('button', { name: 'Exchange', exact: true }).click()
    await expect(page.getByText('this item is protected or reserved')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Exchange', exact: true })).toBeVisible()
  })

  test("an auto exchange rule marks a party member's tile, and nothing is offered without a merchant", async ({ page }) => {
    const server = exchangeServer()
    server.extraState = { autoExchanges: { 'gem0@0': { name: 'gem0', level: 0 } } }
    await server.install(page)

    await page.goto('/characters/Ranger1')
    await expect(page.getByTestId('inventory-slot-0')).toContainText('Auto exchange')
    await page.getByTestId('inventory-slot-0').click()
    await expect(page.getByRole('button', { name: 'Auto exchange', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')

    server.merchantCharacter = null
    await page.reload()
    await page.getByTestId('inventory-slot-0').click()
    await expect(page.getByRole('button', { name: 'Mark for bank', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Exchange', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Auto exchange', exact: true })).toHaveCount(0)
  })
})

test.describe('Merchant job capacity blocking', () => {
  const capacityServer = (occupied: number) => {
    const server = new MockPartyServer()
    server.paired = true
    const items = Array(42).fill(null)
    items.fill({ name: 'ironore', q: 1 }, 0, occupied)
    server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58, items })
    server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
    server.merchantQueue = [
      { id: 'p1', target: 'Ranger1', reason: 'party collection' },
      { id: 'r1', target: 'Ranger1', reason: 'restock' },
    ]
    server.gatheringModes = ['fishing']
    return server
  }

  test('with three or fewer free slots, pickups show blocked and due fishing shows BLOCKED', async ({ page }) => {
    const server = capacityServer(39)
    await server.install(page)

    await page.goto('/characters/Patinder')
    const logistics = page.getByRole('region', { name: /Merchant logistics/ })
    const collection = logistics.locator('div', { hasText: /^P\d+Item collection · Ranger1/ }).last()
    await expect(collection.getByText('blocked', { exact: true })).toHaveAttribute('title', 'Merchant capacity blocked (39/42 slots occupied; three slots reserved)')
    await expect(collection.getByText('blocked', { exact: true })).toHaveClass(/text-red-400/)
    // A blocked job can still be cancelled.
    await expect(logistics.getByRole('button', { name: 'Cancel Item collection' })).toBeVisible()
    const restock = logistics.locator('div', { hasText: /^P\d+Party restock · Ranger1/ }).last()
    await expect(restock.getByText('queued', { exact: true })).toBeVisible()
    const fishing = logistics.locator('div', { hasText: /^P\d+Fishing · Patinder/ }).last()
    await expect(fishing.getByText('BLOCKED', { exact: true })).toBeVisible()
    await expect(logistics.getByRole('button', { name: 'Cancel Fishing' })).toHaveCount(0)
  })

  test('with room in the bag every job is queued, and fishing on cooldown is not listed', async ({ page }) => {
    const server = capacityServer(30)
    server.extraState = { gatheringCooldowns: { mining: Date.now() + 600_000 } }
    server.gatheringModes = ['fishing', 'mining']
    await server.install(page)

    await page.goto('/characters/Patinder')
    const logistics = page.getByRole('region', { name: /Merchant logistics/ })
    await expect(logistics.locator('div', { hasText: /^P\d+Item collection · Ranger1/ }).last().getByText('queued', { exact: true })).toBeVisible()
    await expect(logistics.locator('div', { hasText: /^P\d+Fishing · Patinder/ }).last().getByText('queued', { exact: true })).toBeVisible()
    await expect(logistics.getByText(/Mining · Patinder/)).toHaveCount(0)
    await expect(logistics.getByText('blocked', { exact: true })).toHaveCount(0)
  })
})

test.describe('Upgrade offering preview', () => {
  test('upgrade tier rows show the offering rule covering their last step, optional ones in parentheses', async ({ page }) => {
    const server = new MockPartyServer()
    server.paired = true
    server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, items: [{ name: 'bow', level: 1 }] })
    server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true, maxLevel: 10 })
    server.upgradeOfferingRules = [
      { id: 'rule-0', name: 'bow', floor: 0, ceiling: 2, offering: 'offering', required: false },
      { id: 'rule-1', name: 'bow', floor: 3, ceiling: 5, offering: 'offeringx', required: true },
    ]
    await server.install(page)

    await page.goto('/characters/Merchantina')
    await page.getByTestId('inventory-slot-0').click()
    await page.getByRole('button', { name: 'Mark for upgrade', exact: true }).click()
    // +1 -> +2's last step is +1, inside rule-0 [0, 2).
    const toTwo = page.getByRole('button', { name: /^\+1 → \+2 / })
    await expect(toTwo.getByRole('img', { name: 'Primordial Essence' })).toBeVisible()
    await expect(toTwo).toContainText('(')
    await expect(toTwo.locator('[title="+1 → +2: Primordial Essence (optional)"]')).toHaveCount(1)
    // +2 -> +3 is uncovered.
    await expect(page.getByRole('button', { name: /^\+1 → \+3 / }).getByRole('img')).toHaveCount(0)
    const toFour = page.getByRole('button', { name: /^\+1 → \+4 / })
    await expect(toFour.getByRole('img', { name: 'Primordial X' })).toBeVisible()
    await expect(toFour.locator('[title="+3 → +4: Primordial X (required)"]')).not.toContainText('(')
  })
})
