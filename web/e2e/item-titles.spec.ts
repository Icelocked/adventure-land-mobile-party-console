// Failure inventory for item titles on the screens (the rules are in
// src/lib/itemTitles.test.ts). Each line has a check below.
//
// 1. Item details hide the title: the header reads "Shiny Blade +3" and the extras box
//    "Title: Shiny".
// 2. The item card misses the shiny bonus: a Blade +3 with attack 20 and 2 per level reads
//    "Damage: 30" (20 + 6 + 4).
// 3. The equipment comparison hides the title or the bonus: the proposed side is named
//    "Shiny Blade +3" and its attack rises against the plain equipped Blade +3.
// 4. The catalog comparison hides the title: "From catalog" starts "A: Shiny Blade +3"
//    and column A reads "Shiny Blade" with "Attack: 30".
import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function titleServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({
    name: 'Warrior1',
    ctype: 'warrior',
    level: 60,
    hp: 1000,
    max_hp: 1000,
    items: [{ name: 'blade', level: 3, p: 'shiny' }],
    slots: { mainhand: { item: { name: 'blade', level: 3 } } },
    diagnostics: { primaryStat: 'str', str: 100, attack: 400, armor: 50, resistance: 20, frequency: 1, speed: 30, range: 20 },
  })
  server.addCatalogEntry({
    id: 'blade',
    name: 'Blade',
    upgradeable: true,
    maxLevel: 10,
    scaling: { attack: 2 },
    definition: { type: 'weapon', wtype: 'sword', tier: 1, attack: 20 },
    usage: { classes: [{ id: 'warrior', name: 'Warrior', hands: 1 }] },
  })
  return server
}

test('Item titles: details, item card, equipment comparison and catalog comparison show the title and its bonus', async ({ page }) => {
  await titleServer().install(page)
  await page.goto('/characters/Warrior1')

  // 1 and 2.
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Item details' }).click()
  const details = page.locator('[data-slot="sheet-content"]').last()
  await expect(details.getByText('Shiny Blade +3', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Item extras', exact: true }).locator('[data-line="title"]')).toHaveText('Title: Shiny')
  await expect(page.getByRole('region', { name: 'Item card', exact: true }).locator('[data-line="attack"]')).toHaveText('Damage: 30')

  // 4.
  await details.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('group', { name: 'Compare for' }).getByRole('button', { name: 'From catalog' }).click()
  const controls = page.getByRole('group', { name: 'Catalog comparison' })
  await expect(controls.getByText('A: Shiny Blade +3')).toBeVisible()
  await page.getByRole('button', { name: 'Add to compare' }).click()
  await controls.getByRole('button', { name: 'Compare selected' }).click()
  const table = page.getByRole('table')
  await expect(table.getByText('Shiny Blade', { exact: true })).toBeVisible()
  await expect(table.getByRole('group', { name: 'A stats' }).locator('[data-line="attack"]')).toHaveText('Attack: 30')
  await expect(table.getByRole('group', { name: 'B stats' }).locator('[data-line="attack"]')).toHaveText('Attack: 20(-10 · -33.3%)')

  // 3.
  await page.goto('/characters/Warrior1')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Compare with equipped' }).click()
  await page.getByRole('button', { name: 'Main hand Blade' }).click()
  const sheet = page.locator('[data-slot="sheet-content"]').filter({ hasText: 'Equipment comparison' })
  const proposed = sheet.getByRole('region', { name: 'With this item' })
  await expect(proposed.getByText('Shiny Blade +3', { exact: true })).toBeVisible()
  await expect(sheet.getByRole('region', { name: 'Currently equipped' }).getByText('Blade +3', { exact: true })).toBeVisible()
  await expect(proposed.locator('[data-line="attack"] [data-change]')).toHaveText(/^\(\+/)
})
