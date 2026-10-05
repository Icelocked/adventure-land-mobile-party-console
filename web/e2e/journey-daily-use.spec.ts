import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

/**
 * One long session in a realistic order: check the party, look at one
 * character, switch to another mid-task, run the merchant through
 * bank/craft/mail/WTB errands, then confirm nothing went stale or leaked
 * between characters.
 *
 * Deliberately one test: the per-screen specs cover each screen, this
 * covers navigating between them. Step 2 guards against the monster-focus
 * form surviving a character switch, since the character route reuses the
 * component instance when only the path param changes.
 */
test('Daily use: switching characters mid-task, then a full merchant errand run, leaves nothing stale', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Warriorname', ctype: 'warrior', level: 40, gold: 1000, items: [{ name: 'wcoat', level: 0 }] })
  server.addCharacter({ name: 'Priestname', ctype: 'priest', level: 38, gold: 500, items: [{ name: 'wcoat', level: 0 }] })
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30, gold: 2000, items: [{ name: 'ironore', level: 0, q: 3 }] })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.bankGold = 100
  server.bankPacks = { items1: [{ slot: 0, item: { name: 'wcoat', level: 0 } }] }
  server.deconstructionCatalog = { wcoat: { compound: false, rewards: [{ name: 'leather', quantity: 1, chance: 1 }] } }
  server.craftable = [{ id: 'ironsword', name: 'Iron Sword', cost: 100, materials: [{ id: 'ironore', name: 'Iron Ore', quantity: 3, level: 0 }] }]
  server.mailMessages = [{ id: 'mail-1', from: 'Warriorname', subject: 'Loot', item: { name: 'wcoat' }, taken: false }]
  await server.install(page)

  // 1. Open the party.
  await page.goto('/')
  await expect(page.getByText('Warriorname')).toBeVisible()
  await expect(page.getByText('Priestname')).toBeVisible()
  await expect(page.getByText('Merchantina')).toBeVisible()
  // party-gold.tsx total: 1000+500+2000 carried + 100 bank
  await expect(page.getByRole('button', { name: 'Party gold' })).toContainText('(3,600 total)')

  // 2. Start editing Warriorname's monster focus, then switch to Priestname
  // mid-task; the open form must not carry over.
  await page.getByText('Warriorname').click()
  await expect(page).toHaveURL(/\/characters\/Warriorname/)
  await page.getByRole('button', { name: 'No monsters selected' }).click()
  await expect(page.getByPlaceholder('Search monsters…')).toBeVisible()

  await page.getByRole('button', { name: /^Priestname/ }).click()
  await expect(page).toHaveURL(/\/characters\/Priestname/)
  await expect(page.getByPlaceholder('Search monsters…')).not.toBeVisible()

  // 3. On Priestname, mark the carried item for auto-sell.
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Auto sell to NPC…' }).click()
  await page.getByRole('button', { name: 'Enable auto sale' }).click()
  await expect(page.getByRole('button', { name: 'Auto sell to NPC…' })).not.toBeVisible()

  // 4. Detour through the account menu to the bank, then back to Priestname.
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('button', { name: 'Inspect Bank' }).click()
  await expect(page.getByText('Wolf Coat')).toBeVisible()
  await page.getByText('Wolf Coat').click()
  await page.getByRole('button', { name: 'Mark for deconstruction', exact: true }).click()
  await page.getByRole('group', { name: 'Mark for deconstruction?' }).getByRole('button', { name: 'Mark for deconstruction' }).click()
  await expect(page.getByText('No snapshot yet. Send a character to the bank once to load it.')).not.toBeVisible()
  // Bank-sourced deconstruction queues for the merchant; the item stays put, marked.
  await expect(page.getByText('Wolf Coat', { exact: true })).toBeVisible()
  await expect(page.getByText('Deconstruct', { exact: true })).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/\/characters\/Priestname/)

  // 5. As the merchant: craft, collect mail and place a buy order, reaching
  // each screen through in-app navigation so a broken menu link fails too.
  await page.getByRole('button', { name: /^Merchantina/ }).click()
  await expect(page).toHaveURL(/\/characters\/Merchantina/)

  await page.getByRole('button', { name: 'Craft', exact: true }).click()
  await expect(page).toHaveURL(/\/merchant\/craft/)
  await page.getByRole('button', { name: 'Add' }).click()
  const craftButton = page.locator('.sticky.bottom-0').getByRole('button', { name: 'Craft', exact: true })
  await expect(craftButton).toBeEnabled()
  await craftButton.click()
  await expect.poll(() => server.lastOrder?.path).toBe('merchant/order')
  // A placed order navigates back; let that land before the next goto.
  await expect(page).not.toHaveURL(/\/merchant\/craft/)

  await page.goto('/characters/Merchantina')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('button', { name: 'Mail' }).click()
  await page.getByText('Loot').click()
  await page.getByRole('button', { name: 'Collect attachment' }).click()
  await expect(page.getByText('Collected', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.goto('/characters/Merchantina')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('button', { name: 'View Market' }).click()
  await page.getByRole('button', { name: /Manage WTB orders/ }).click()
  await expect(page).toHaveURL(/\/wtb/)
  await page.getByRole('button', { name: 'New WTB order' }).click()
  await page.getByPlaceholder('Search every item…').fill('Iron Ore')
  await page.getByText('Iron Ore').click()
  await page.getByLabel('Maximum price').fill('50')
  await page.getByRole('button', { name: 'Place WTB' }).click()
  await expect(page.getByRole('button', { name: 'Edit price for Iron Ore' })).toHaveText('50g')

  // 6. Back on the party overview, every change has stuck, including
  // Priestname's auto-sell mark from step 3. (A per-player rule shows as the
  // tile's banner; rule lists are merchant-only.)
  await page.goto('/characters/Priestname')
  await expect(page.getByTestId('inventory-slot-0')).toContainText('NPC sale')
})
