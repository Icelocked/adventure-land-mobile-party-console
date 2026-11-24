import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer, SHIPPED_ADDONS } from './fixtures/mockPartyServer'

// OWNERS-PORT-MAP.md B10: the add-on manager in the settings menu's Addons tab
// (runtime/hooks/dashboard/settings-page.tsx) and the shipped add-ons' pieces: Tank Hold's farming
// line, the Cosmetics panel and the NPC Orders sheet. Achievement Hunt and Market Filters have
// their own specs.

function posts(page: Page) {
  const sent: { path: string; body: Record<string, unknown> }[] = []
  page.on('request', (request) => {
    const match = request.url().match(/\/party-api\/(addons|addon-command|addon-farming)$/)
    if (request.method() === 'POST' && match) sent.push({ path: match[1], body: request.postDataJSON() })
  })
  return sent
}

function party() {
  const server = new MockPartyServer()
  server.paired = true
  server.leader = 'Leada'
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 70 })
  server.addCharacter({ name: 'Healy', ctype: 'priest', level: 70 })
  server.addons = SHIPPED_ADDONS.map((addon) => structuredClone(addon))
  return server
}

test('the Addons tab lists every installed add-on with its switch and settings, and saves each through POST /addons', async ({ page }) => {
  const server = party()
  await server.install(page)
  const sent = posts(page)
  await page.goto('/settings/menu?tab=addons')
  const manager = page.getByRole('region', { name: 'Add-ons' })
  await expect(manager.locator('[data-addon]')).toHaveCount(5)
  await expect(manager.locator('[data-addon="tank-hold"]')).toContainText('Tank Hold')
  await expect(manager.locator('[data-addon="tank-hold"]')).toContainText('by Icelocked')

  await manager.getByRole('checkbox', { name: 'tank-hold on' }).click()
  await expect.poll(() => sent.at(-1)).toEqual({ path: 'addons', body: { name: 'tank-hold', enabled: true } })
  await expect(manager.getByRole('checkbox', { name: 'tank-hold on' })).toBeChecked()

  const danger = manager.getByRole('spinbutton', { name: 'tank-hold The tank is in danger below this share of its HP (%)' })
  await danger.fill('40')
  await danger.blur()
  await expect.poll(() => sent.at(-1)).toEqual({ path: 'addons', body: { name: 'tank-hold', settings: { dangerHp: 40 } } })

  // A records setting saves its whole list on each change.
  await manager.getByRole('button', { name: 'npc-orders Orders (the Ponty / Ron dialog places them) add' }).click()
  await expect.poll(() => sent.at(-1)).toEqual({ path: 'addons', body: { name: 'npc-orders', settings: { orders: [{ id: '', npc: 'ponty', item: '', level: 0, count: 0, maxPrice: 1, stopped: false }] } } })

  // One add-on's own section shows only it.
  await page.getByRole('tab', { name: 'Achievement Hunt' }).click()
  await expect(manager.locator('[data-addon]')).toHaveCount(1)
  await expect(manager.locator('[data-addon="achievement-hunt"]')).toBeVisible()

  // A refusal shows in the manager's alert.
  server.failOnce.addons = 'Achievement Hunt holds the target mode slot'
  await manager.getByRole('checkbox', { name: 'achievement-hunt on' }).click()
  await expect(manager.getByRole('alert')).toHaveText('Achievement Hunt holds the target mode slot')
})

test("Tank Hold's farming line saves the picks to the scope store and shows the character's role", async ({ page }) => {
  const server = party()
  server.characters[0].diagnostics = { addonReports: { 'tank-hold': { role: 'Tank', line: 'holding 3' } } }
  await server.install(page)
  const sent = posts(page)
  await page.goto('/characters/Leada')
  const farming = page.getByRole('region', { name: 'Farming' })
  await expect(farming.getByRole('group', { name: 'Target mode' })).toBeVisible()
  await expect(farming.getByRole('combobox', { name: 'Tank Hold Tank' })).toHaveCount(0)

  server.enableAddon('tank-hold')
  await page.reload()
  await farming.getByRole('combobox', { name: 'Tank Hold Tank' }).selectOption('Leada')
  await expect.poll(() => sent.at(-1)).toEqual({ path: 'addon-command', body: { name: 'tank-hold', verb: 'store', key: 'scope:Leada', patch: { tank: 'Leada' } } })
  await expect(farming.getByRole('combobox', { name: 'Tank Hold Tank' })).toHaveValue('Leada')
  await expect(farming.getByRole('combobox', { name: 'Tank Hold Puller' }).locator('option').first()).toHaveText('The tank')
  await farming.getByRole('checkbox', { name: 'Tank Hold Pull' }).click()
  await expect.poll(() => sent.at(-1)).toEqual({ path: 'addon-command', body: { name: 'tank-hold', verb: 'store', key: 'scope:Leada', patch: { pull: true } } })
  await expect(farming.getByText('Tank · holding 3')).toBeVisible()
})

test('the Cosmetics panel draws the add-on report and presses through POST /addon-command', async ({ page }) => {
  const server = party()
  server.enableAddon('cosmetics')
  server.characters[0].diagnostics = {
    addonReports: {
      cosmetics: {
        worn: { hat: 'Party Hat' },
        owned: [{ name: 'Party Hat', count: 1, worn: true, slot: 'hat' }, { name: 'Wings', count: 2, worn: false, slot: 'back' }],
        jars: [{ cell: 4, look: null }],
        emotes: [{ skill: 'wave', name: 'Wave', targeted: false }, { skill: 'hug', name: 'Hug', targeted: true }],
      },
    },
  }
  server.addonStores = { cosmetics: { party: { 'last.Leada': { label: 'Put on Wings', outcome: 'refused', detail: 'items: not unlocked', at: 1 } } } }
  await server.install(page)
  const sent = posts(page)
  await page.goto('/characters/Leada')
  const panel = page.getByRole('region', { name: 'Cosmetics' })
  await panel.getByRole('button', { name: 'Cosmetics' }).click()
  await expect(panel).toContainText('Bag 5: unknown look')
  await expect(panel).toContainText('Hug (needs a target)')
  await expect(panel).toContainText('Put on Wings: refused (items: not unlocked)')
  await panel.getByRole('button', { name: 'Wings x2' }).click()
  await expect.poll(() => sent.at(-1)).toEqual({ path: 'addon-command', body: { name: 'cosmetics', character: 'Leada', body: { wear: { slot: 'back', name: 'Wings' } } } })
  await panel.getByRole('button', { name: 'hat: Party Hat' }).click()
  await expect.poll(() => sent.at(-1)).toEqual({ path: 'addon-command', body: { name: 'cosmetics', character: 'Leada', body: { takeOff: { slot: 'hat' } } } })
  await panel.getByRole('button', { name: 'Wave' }).click()
  await expect.poll(() => sent.at(-1)).toEqual({ path: 'addon-command', body: { name: 'cosmetics', character: 'Leada', body: { emote: 'wave' } } })
  await expect(panel.getByRole('button', { name: 'Hug (needs a target)' })).toHaveCount(0)
})

test('the Ponty / Ron sheet places, stops and removes orders through the add-on settings and asks for a Ron visit', async ({ page }) => {
  const server = party()
  server.addCharacter({ name: 'Mercy', ctype: 'merchant', level: 60 })
  server.enableAddon('npc-orders')
  server.extraState = { goldReserve: 1_000, characterSnapshots: { Mercy: { gold: 50_000 } } }
  server.addonReadAnswers = { 'market.ponty': [{ rid: 'r1', key: 'US:I:r1', item: { name: 'coat', level: 2 }, quantity: 1, unitPrice: 1200, serverRegion: 'US', serverIdentifier: 'I' }] }
  await server.install(page)
  const sent = posts(page)
  await page.goto('/characters/Mercy')
  await page.getByRole('button', { name: 'Ponty / Ron' }).click()
  const sheet = page.locator('[data-area="npc-orders"]')
  await expect(sheet).toContainText('50,000g carried, reserve 1,000g')
  const lot = sheet.locator('[data-stock="US:I:r1"]')
  await expect(lot).toContainText('coat +2')
  await lot.getByRole('spinbutton', { name: 'Max unit price for coat' }).fill('1500')
  await lot.getByRole('button', { name: 'Buy 1' }).click()
  await expect.poll(() => sent.at(-1)?.path).toBe('addons')
  const placed = (sent.at(-1)!.body.settings as { orders: Record<string, unknown>[] }).orders
  expect(placed).toEqual([{ npc: 'ponty', item: 'coat', level: 2, count: 1, maxPrice: 1500, id: expect.any(String) }])
  const order = sheet.locator(`[data-order="${placed[0].id}"]`)
  await expect(order).toContainText('Buy 1, up to 1,500g each, 0 bought')
  await expect(order).toContainText('Next: 1 at 1,200g each on USI')
  await order.getByRole('button', { name: 'Stop' }).click()
  await expect.poll(() => (sent.at(-1)!.body.settings as { orders: Record<string, unknown>[] }).orders[0].stopped).toBe(true)
  await expect(order).toContainText('Stopped')
  await order.getByRole('button', { name: 'Remove coat +2' }).click()
  await expect.poll(() => (sent.at(-1)!.body.settings as { orders: unknown[] }).orders).toEqual([])

  await sheet.getByRole('tab', { name: 'Ron' }).click()
  await expect(sheet.getByRole('button', { name: 'Visit Ron' })).toBeDisabled()
  await sheet.getByRole('checkbox', { name: 'Donate to Ron to see his list' }).click()
  await expect.poll(() => sent.at(-1)).toEqual({ path: 'addons', body: { name: 'npc-orders', settings: { ronDonate: true } } })
  await sheet.getByRole('button', { name: 'Visit Ron' }).click()
  await expect.poll(() => sent.at(-1)).toEqual({ path: 'addon-command', body: { name: 'npc-orders', body: { visitRon: true } } })
  await expect(sheet.getByRole('status')).toHaveText('The merchant visits Ron on its next free pass.')
})
