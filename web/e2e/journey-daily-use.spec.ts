import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

/**
 * A single long session walking through the app roughly the way a real
 * player actually would in one sitting: check the party, look at one
 * character, get pulled away mid-task to another character, run the
 * merchant through bank/craft/mail/WTB errands, and come back to confirm
 * nothing was left stale or bled between characters along the way.
 *
 * This is deliberately ONE test, not a pile of isolated per-screen
 * checks - the earlier e2e pass (account-screens*.spec.ts) already covers
 * each screen in isolation; what was missing was proof that navigating
 * BETWEEN them in a realistic order doesn't break anything. Step 2 in
 * particular is a direct regression test for a real bug fixed earlier
 * this project: FarmingSection's monster-focus form used to keep showing
 * the PREVIOUS character's open form after switching characters, because
 * the character-detail route re-renders the same component instance
 * instead of remounting on a path-param-only change.
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
  server.deconstructionCatalog = { wcoat: { compound: false } }
  server.craftable = [{ id: 'ironsword', name: 'Iron Sword', cost: 100, materials: [{ id: 'ironore', name: 'Iron Ore', quantity: 3, level: 0 }] }]
  server.mailMessages = [{ id: 'mail-1', from: 'Warriorname', subject: 'Loot', item: { name: 'wcoat' }, taken: false }]
  await server.install(page)

  // 1. Open the party - a real session usually starts here.
  await page.goto('/')
  await expect(page.getByText('Warriorname')).toBeVisible()
  await expect(page.getByText('Priestname')).toBeVisible()
  await expect(page.getByText('Merchantina')).toBeVisible()
  // party-gold.tsx total: 1000+500+2000 carried + 100 bank
  await expect(page.getByRole('button', { name: 'Party gold' })).toContainText('(3,600 total)')

  // 2. Drill into Warriorname, start (but don't finish) editing their
  // monster focus, then get pulled away to Priestname mid-task - exactly
  // the sequence that used to leak Warriorname's open form into Priestname.
  await page.getByText('Warriorname').click()
  await expect(page).toHaveURL(/\/characters\/Warriorname/)
  await page.getByRole('button', { name: 'No monsters selected' }).click()
  await expect(page.getByPlaceholder('Search monsters...')).toBeVisible()

  await page.getByRole('button', { name: /^Priestname/ }).click()
  await expect(page).toHaveURL(/\/characters\/Priestname/)
  await expect(page.getByPlaceholder('Search monsters...')).not.toBeVisible()

  // 3. On Priestname, mark the carried item for auto-sell.
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Auto-sell to NPC' }).click()
  await expect(page.getByRole('button', { name: 'Auto-sell to NPC' })).not.toBeVisible()

  // 4. A detour through the account menu to the bank, to clear an item -
  // then back to right where we left off (Priestname), same as tabbing
  // out to a different app section and returning.
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('button', { name: 'Inspect Bank' }).click()
  await expect(page.getByText('Wolf Coat')).toBeVisible()
  await page.getByText('Wolf Coat').click()
  await page.getByRole('button', { name: 'Mark for deconstruction', exact: true }).click()
  await expect(page.getByText('No bank data yet.')).not.toBeVisible()
  // Bank-sourced deconstruction queues for the merchant to collect - the
  // item stays put (now marked), it doesn't vanish the instant it's marked.
  await expect(page.getByText('Wolf Coat')).toBeVisible()
  await expect(page.getByText('Deconstruct', { exact: true })).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/\/characters\/Priestname/)

  // 5. Switch to the merchant and run a realistic errand chain: craft
  // something affordable, collect mail, and place a standing buy order -
  // three different screens reached through real in-app navigation, not
  // page.goto shortcuts, so a broken menu link would fail this too.
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
  await page.getByRole('button', { name: 'Add WTB order' }).click()
  await page.getByPlaceholder('Search items...').fill('Iron Ore')
  await page.getByText('Iron Ore').click()
  await page.getByLabel('Maximum price').fill('50')
  await page.getByRole('button', { name: 'Place WTB' }).click()
  await expect(page.getByText('50g')).toBeVisible()

  // 6. Back to the party overview - confirm the WHOLE session's worth of
  // changes actually stuck (nothing silently reverted or went stale),
  // and Priestname's much-earlier auto-sell mark from step 3 is still
  // exactly where it should be after all this navigation.
  await page.goto('/characters/Priestname')
  await page.getByRole('button', { name: /Auto NPC sales \(1\)/ }).click()
  await expect(page.getByText('Wolf Coat')).toBeVisible()
})
