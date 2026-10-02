import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Bank: deconstruction options are hidden unless the item is actually deconstructible', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  server.bankGold = 1000
  server.bankPacks = {
    items1: [
      { slot: 0, item: { name: 'ironore', level: 0, q: 5 } },
      { slot: 1, item: { name: 'wcoat', level: 0 } },
    ],
  }
  // Only wcoat is deconstructible - matches deconstruction.ts's
  // canDeconstruct requiring a catalog entry to exist at all.
  server.deconstructionCatalog = { wcoat: { compound: false, rewards: [{ name: 'leather', quantity: 1, chance: 1 }] } }
  await server.install(page)

  await page.goto('/bank')
  await page.getByText('Iron Ore').click()
  await expect(page.getByRole('button', { name: 'Mark for deconstruction', exact: true })).not.toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByText('Wolf Coat').click()
  await page.getByRole('button', { name: 'Mark for deconstruction', exact: true }).click()
  await page.getByRole('group', { name: 'Mark for deconstruction?' }).getByRole('button', { name: 'Mark for deconstruction' }).click()
  // Bank-sourced deconstruction queues for the merchant to actually
  // collect - the item stays in the pack (with a marked indicator) until
  // then, it doesn't vanish the instant it's marked.
  await expect(page.getByText('Wolf Coat', { exact: true })).toBeVisible()
  await expect(page.getByText('Deconstruct', { exact: true })).toBeVisible()
})

test('Bank: pack header shows occupied/total and free slot count', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  // A 10-slot pack with 2 filled, 8 empty (padded with null, the same
  // fixed-length shape the real bank snapshot sends) - the list view
  // alone gave no way to tell open slots existed at all.
  server.bankPacks = {
    items1: [{ slot: 0, item: { name: 'ironore', level: 0, q: 5 } }, null, null, { slot: 3, item: { name: 'ironore', level: 0 } }, null, null, null, null, null, null],
  }
  await server.install(page)

  await page.goto('/bank')
  await expect(page.getByText('2/10 · 8 free')).toBeVisible()
})

test('Bank: a pack can be collapsed and expanded, hiding and restoring its item rows', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.bankPacks = { items1: [{ slot: 0, item: { name: 'ironore', level: 0, q: 5 } }] }
  await server.install(page)

  await page.goto('/bank')
  await expect(page.getByText('Iron Ore')).toBeVisible()

  await page.getByText('items1').click()
  await expect(page.getByText('Iron Ore')).not.toBeVisible()

  await page.getByText('items1').click()
  await expect(page.getByText('Iron Ore')).toBeVisible()
})

test('Bank: marking for withdrawal is a real toggle, and matches the dashboard by always targeting the merchant', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.bankPacks = { items1: [{ slot: 0, item: { name: 'ironore', level: 0, q: 5 } }] }
  await server.install(page)

  await page.goto('/bank')
  await page.getByText('Iron Ore').click()
  await expect(page.getByRole('button', { name: 'Mark for withdrawal' })).toBeVisible()

  await page.getByRole('button', { name: 'Mark for withdrawal' }).click()
  await expect.poll(() => server.withdrawals.Merchantina?.length).toBe(1)
  // The row itself shows the mark (bank-sheet.tsx's amber border + label).
  await expect(page.getByText('Withdraw', { exact: true })).toBeVisible()

  await page.getByText('Iron Ore').click()
  await page.getByRole('button', { name: 'Unmark withdrawal' }).click()
  await expect.poll(() => server.withdrawals.Merchantina?.length ?? 0).toBe(0)
  await expect(page.getByText('Withdraw', { exact: true })).not.toBeVisible()
})

test('Bank: marking an item for NPC sale shows a marked indicator', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.bankPacks = { items1: [{ slot: 0, item: { name: 'ironore', level: 0, q: 5 } }] }
  await server.install(page)

  await page.goto('/bank')
  await page.getByText('Iron Ore').click()
  await page.getByRole('button', { name: 'Sell to NPC…', exact: true }).click()
  await page.getByRole('group', { name: 'Sell to NPC' }).getByRole('button', { name: 'Sell to NPC' }).click()

  // Bank-sourced NPC sales queue for the merchant to collect (they don't
  // vanish instantly) - the row should still be there, now marked.
  await expect(page.getByText('Iron Ore')).toBeVisible()
  await expect(page.getByText('NPC', { exact: true })).toBeVisible()
})

test('Bank: marking for stand shows as already-marked and can be unmarked', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.bankPacks = { items1: [{ slot: 0, item: { name: 'ironore', level: 0, q: 5 } }] }
  await server.install(page)

  await page.goto('/bank')
  await page.getByText('Iron Ore').click()
  await page.getByRole('button', { name: 'Mark for stand', exact: true }).click()
  await page.getByRole('textbox', { name: 'Stand price' }).fill('100')
  await page.getByRole('button', { name: 'List' }).click()

  await expect.poll(() => server.standListings.length).toBe(1)
  await expect(page.getByText('Stand', { exact: true })).toBeVisible()

  await page.getByText('Iron Ore').click()
  await page.getByRole('button', { name: 'Unmark for stand' }).click()
  await expect.poll(() => server.standListings.length).toBe(0)
  await page.getByText('Iron Ore').click()
  await expect(page.getByRole('button', { name: 'Mark for stand', exact: true })).toBeVisible()
  await expect(page.getByText('Stand', { exact: true })).not.toBeVisible()
})

test('Mail: Collect marks the attachment as taken', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.mailMessages = [{ id: 'mail-1', from: 'Warriorname', subject: 'Loot', item: { name: 'ironore' }, taken: false }]
  await server.install(page)

  await page.goto('/mail')
  await expect(page.getByText('Attachment available')).toBeVisible()
  await page.getByText('Loot').click()
  await expect(page.getByText('Unclaimed')).toBeVisible()
  // send-mail-dialog.tsx: delete is blocked while the attachment is uncollected.
  await expect(page.getByRole('button', { name: 'Delete message' })).toBeDisabled()
  await page.getByRole('button', { name: 'Collect attachment' }).click()

  await expect(page.getByText('Collected', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Collect attachment' })).toBeDisabled()
  await page.getByRole('button', { name: 'Delete message' }).click()
  await page.getByRole('button', { name: 'Confirm permanent deletion' }).click()
  await expect.poll(() => server.mailActions.map((a) => a.action)).toEqual(['collect', 'delete'])
  await expect(page.getByText('No received mail.')).toBeVisible()
})

test('Mail: compose with a bank attachment sends the dashboard body after a second tap', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.bankPacks = { items0: [{ slot: 4, item: { name: 'ironore', q: 20 } }] }
  server.mailPostage = 50000
  server.mailMessages = [{ id: 'mail-1', from: 'Friend', to: 'Merchantina', subject: 'Hello', message: 'line one', sent: '2026-10-01T00:00:00Z', taken: false }]
  await server.install(page)

  await page.goto('/mail')
  await page.getByText('Hello').click()
  await page.getByRole('button', { name: 'Reply' }).click()
  const compose = page.getByRole('region', { name: 'Write message' })
  await expect(compose.getByLabel('Character name')).toHaveValue('Friend')
  await expect(compose.getByText('Postage: 50,000 gold per message, charged by Adventure Land.')).toBeVisible()

  await compose.getByLabel('Subject').fill('Ore')
  await compose.getByLabel('Search attachments').fill('iron')
  await compose.getByRole('group', { name: 'Bank · items0' }).getByText('Iron Ore').click()
  await expect(compose.getByText('The attached items also leave your inventory.', { exact: false })).toBeVisible()
  // Stackable: the quantity must be 1-20 before Send enables.
  await expect(compose.getByRole('button', { name: 'Send mail' })).toBeDisabled()
  await compose.getByLabel('Quantity (1–20)').fill('25')
  await expect(compose.getByRole('button', { name: 'Send mail' })).toBeDisabled()
  await compose.getByLabel('Quantity (1–20)').fill('5')
  await compose.getByRole('button', { name: 'Send mail' }).click()
  expect(server.lastOrder).toBeNull()
  await compose.getByRole('button', { name: 'Really send mail?' }).click()
  await expect.poll(() => server.lastOrder).toEqual({
    path: 'merchant/send-mail',
    recipient: 'Friend',
    subject: 'Ore',
    message: '',
    quantity: 5,
    source: { pack: 'items0', slot: 4, item: { name: 'ironore', q: 20 } },
  })
  await expect(page.getByRole('region', { name: 'Write message' })).not.toBeVisible()
})

test('Stand: Remove drops a listing', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.standListings = [{ id: 'listing-1', slot: 3, item: { name: 'ironore', level: 0 }, price: 500, quantity: 1 }]
  await server.install(page)

  await page.goto('/stand')
  await expect(page.getByText('Iron Ore')).toBeVisible()
  await page.getByRole('button', { name: 'Remove' }).click()
  // stand-sheet.tsx: the second tap confirms.
  await page.getByRole('button', { name: 'Really remove?' }).click()

  await expect(page.getByText('Nothing listed on the stand.')).toBeVisible()
})

test('ALData Prepare mail opens the mail composer with the auth draft (use-party-console.tsx setMailDraft)', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.extraState = { aldata: { listings: [], hasKey: true, auth: 'NO' } }
  await server.install(page)
  await page.route('**/party-api/aldata/key', (route) => route.fulfill({ json: { key: 'secret-key' } }))

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Prepare mail' }).click()
  await expect(page).toHaveURL(/\/mail/)
  const compose = page.getByRole('region', { name: 'Write message' })
  await expect(compose.getByLabel('Character name')).toHaveValue('earthiverse')
  await expect(compose.getByLabel('Subject')).toHaveValue('aldata_auth')
  await expect(compose.getByLabel('Message')).toHaveValue('secret-key')
  await expect(compose.getByText('Postage estimate unavailable.', { exact: false })).toBeVisible()
  await compose.getByRole('button', { name: 'Send mail' }).click()
  await compose.getByRole('button', { name: 'Really send mail?' }).click()
  await expect.poll(() => server.lastOrder).toEqual({ path: 'merchant/send-mail', recipient: 'earthiverse', subject: 'aldata_auth', message: 'secret-key', quantity: 1 })
})
