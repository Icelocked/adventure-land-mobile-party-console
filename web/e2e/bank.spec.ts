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

function bankServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  server.addCatalogEntry({ id: 'bow', name: 'Bow', upgradeable: true })
  server.bankPacks = {
    items1: [
      { slot: 0, item: { name: 'ironore', q: 5 } },
      { slot: 1, item: { name: 'bow', level: 2 } },
      ...Array.from({ length: 33 }, () => null),
      { slot: 35, item: { name: 'ironore', q: 1 } },
    ],
  }
  return server
}

test('Bank: search dims non-matches; reserved items1 slots are labelled', async ({ page }) => {
  const server = bankServer()
  await server.install(page)

  await page.goto('/bank')
  await expect(page.getByText('RESERVED', { exact: true })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search bank items' }).fill('bow')
  await expect(page.getByRole('button', { name: /Bow \+2/ })).not.toHaveClass(/opacity-25/)
  await expect(page.getByRole('button', { name: /Iron Ore x5/ })).toHaveClass(/opacity-25/)
})

test('Bank: tapping an item opens its options with Item details first; upgrade marks go through withdraw with upgradeTiers', async ({ page }) => {
  const server = bankServer()
  await server.install(page)
  const bodies = posts(page)

  await page.goto('/bank')
  await page.getByRole('button', { name: /Bow \+2/ }).click()
  await expect(page.getByRole('button', { name: 'Item details' })).toBeVisible()
  await page.getByRole('button', { name: 'Mark for upgrade', exact: true }).click()
  await page.getByRole('button', { name: /\+2 → \+4/ }).click()
  await expect.poll(() => bodies.find((b) => b.path === 'command')?.body).toMatchObject({ character: 'Patinder', type: 'withdraw', pack: 'items1', slot: 1, upgradeTiers: 2 })
})

test('Bank: Auto mark for upgrade, auto sell to NPC and Clear all marks act as the merchant', async ({ page }) => {
  const server = bankServer()
  await server.install(page)
  const bodies = posts(page)

  await page.goto('/bank')
  await page.getByRole('button', { name: /Bow \+2/ }).click()
  await page.getByRole('button', { name: 'Auto mark for upgrade' }).click()
  await page.getByRole('button', { name: /\+2 → \+3/ }).click()
  await expect.poll(() => bodies.find((b) => b.body.type === 'auto-upgrade-mark')?.body).toMatchObject({ character: 'Patinder', slot: -1, tiers: 1 })

  await page.getByRole('button', { name: /Iron Ore x5/ }).click()
  await page.getByRole('button', { name: 'Auto sell to NPC…' }).click()
  await page.getByRole('button', { name: 'Enable auto sale' }).click()
  await expect.poll(() => bodies.find((b) => b.path === 'merchant/auto-npc-sale')?.body).toMatchObject({ character: 'Patinder', action: 'set' })

  await page.getByRole('button', { name: /Iron Ore x5/ }).click()
  await page.getByRole('button', { name: 'Clear all marks' }).click()
  await expect.poll(() => bodies.find((b) => b.body.type === 'clear-item-marks')?.body).toMatchObject({ character: 'Patinder', pack: 'items1', slot: 0 })
})

test('Bank storage: floors show access, key unlocks show owned count, gold unlocks confirm with the merchant and cost', async ({ page }) => {
  const server = bankServer()
  server.bankPacks = { ...server.bankPacks, items2: [] }
  server.bankPacks.items1.push({ slot: 36, item: { name: 'basementkey', q: 1 } })
  await server.install(page)
  await page.route('**/party-api/state?*section=catalog*', async (route) => {
    const json = server.stateSection('catalog', true) as Record<string, unknown>
    json.bankVaults = [
      { pack: 'items2', floor: 'bank', gold: 0 },
      { pack: 'items3', floor: 'bank', gold: 75_000_000 },
      { pack: 'items8', floor: 'bank_b', gold: 0, key: { id: 'basementkey', name: 'Basement Key' } },
      { pack: 'items9', floor: 'bank_b', gold: 100_000_000 },
    ]
    await route.fulfill({ json })
  })
  const bodies = posts(page)

  await page.goto('/bank')
  const storage = page.getByRole('region', { name: 'Additional bank storage' })
  await expect(storage.getByText('Main bank')).toBeVisible()
  await expect(storage.getByText('Locked · requires Basement Key')).toBeVisible()
  await expect(storage.getByText('Owned: 1')).toBeVisible()
  await expect(storage.getByText('Vault purchases remain disabled until floor access is unlocked.')).toBeVisible()
  // Gold vaults only on accessible floors.
  await expect(storage.getByRole('button', { name: /Unlock items9/ })).toHaveCount(0)

  await storage.getByRole('button', { name: /Unlock items3/ }).click()
  await expect(storage.getByText('Patinder will spend 75,000,000 gold to permanently unlock items3.')).toBeVisible()
  await storage.getByRole('button', { name: 'Confirm unlock' }).click()
  await expect.poll(() => bodies.find((b) => b.path === 'bank/unlock')?.body).toEqual({ pack: 'items3', kind: 'gold' })
})

test('Bankbois: the first one asks before reserving bank slots; items open the bank options; delete is two-step and only when empty', async ({ page }) => {
  const server = bankServer()
  server.extraState = { bankboiPrefix: 'Vault' }
  await server.install(page)
  const bodies = posts(page)

  await page.goto('/bank')
  const section = page.getByRole('region', { name: 'Bankbois' })
  await expect(section.getByText(/No bankbois yet/)).toBeVisible()
  await section.getByRole('button', { name: 'Create bankboi' }).click()
  await expect(section.getByText('This will reserve 7 slots from bank pane 1 for BankBoi logistics.')).toBeVisible()
  await section.getByRole('group', { name: 'Create first BankBoi?' }).getByRole('button', { name: 'Create BankBoi' }).click()
  await expect(section.getByText('Success: Vault0 created · provisioning queued')).toBeVisible()
  expect(bodies.some((b) => b.path === 'bankbois/create')).toBe(true)

  server.extraState = {
    ...server.extraState,
    bankbois: [
      { name: 'Vault0', ctype: 'merchant', state: 'idle', items: [] },
      { name: 'Vault1', ctype: 'merchant', state: 'idle', items: [{ slot: 0, item: { name: 'ironore', q: 9 } }] },
    ],
  }
  await expect(section.getByText('Vault1')).toBeVisible({ timeout: 20_000 })
  const card = section.locator('div.rounded-md', { hasText: 'Vault1' }).first()
  await expect(card.getByRole('button', { name: 'Delete' })).toBeDisabled()

  await card.getByRole('button', { name: /Iron Ore x9/ }).click()
  await page.getByRole('button', { name: 'Mark for withdrawal' }).click()
  await expect.poll(() => bodies.find((b) => b.body.type === 'withdraw')?.body).toMatchObject({ pack: 'bankboi:Vault1', slot: 0 })

  const empty = section.locator('div.rounded-md', { hasText: 'Vault0' }).first()
  await empty.getByRole('button', { name: 'Delete' }).click()
  await empty.getByRole('button', { name: 'Really? ×' }).click()
  await expect.poll(() => bodies.some((b) => b.path === 'bankbois/Vault0/delete')).toBe(true)
})

test('Bankbois: creating is blocked until a bankboi name is set', async ({ page }) => {
  const server = bankServer()
  await server.install(page)

  await page.goto('/bank')
  const section = page.getByRole('region', { name: 'Bankbois' })
  await expect(section.getByText('Set bankboi name in settings first')).toBeVisible()
  await expect(section.getByRole('button', { name: 'Create bankboi' })).toBeDisabled()
})

test('Bank parity: Merchant’s Luck clover, Auto stand banner replacing the stand mark, sort toggle help and errors, withdraw confirmation keeps its error', async ({ page }) => {
  const server = bankServer()
  server.bankPacks.items1[0] = { slot: 0, item: { name: 'ironore', q: 5, m: 1 } }
  const key = JSON.stringify({ name: 'bow', level: 2, p: null, stat_type: null })
  server.extraState = {
    autoStandMarks: { [key]: { item: { name: 'bow', level: 2 }, price: 1500 } },
    standListings: [{ id: 's1', bankPack: 'items1', bankSlot: 1, item: { name: 'bow', level: 2 }, price: 1500, quantity: 1 }],
    merchantRoutinePriorities: {},
    bankSortMode: 'request',
    autoItemMarks: { Patinder: { 'ironore@+0': 'bank' } },
  }
  await server.install(page)
  await page.goto('/bank')

  await expect(page.getByLabel("Merchant's Luck duplicate")).toHaveCount(1)
  const bow = page.getByRole('button', { name: /^Bow \+2/ })
  await expect(bow.getByText('Auto stand')).toHaveAttribute('title', 'Auto stand · 1,500g')
  await expect(bow.getByText('Stand', { exact: true })).toHaveCount(0)

  await expect(page.getByText(/^Sorts all accessible bank floors after banking work\./)).toBeVisible()
  server.failOnce['merchant/bank-sort'] = 'Sorting is unavailable'
  await page.getByRole('button', { name: /^Sort on next visit/ }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Sorting is unavailable' })).toBeVisible()

  // Withdraw an auto-bank-marked item: the confirmation stays open with a failure.
  await page.getByRole('button', { name: /Iron Ore x5/ }).click()
  await page.getByRole('button', { name: 'Mark for withdrawal' }).click()
  const confirm = page.getByRole('group', { name: 'Remove automatic bank mark?' })
  await expect(confirm).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark all for withdrawal' })).toBeDisabled()
  server.failOnce['command'] = 'Merchant is busy'
  await confirm.getByRole('button', { name: 'Confirm' }).click()
  await expect(confirm.getByRole('alert')).toHaveText('Merchant is busy')
})

test('Bank: an empty bank tells you how to load the snapshot', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  await server.install(page)
  await page.goto('/bank')
  await expect(page.getByText('No snapshot yet. Send a character to the bank once to load it.')).toBeVisible()
})

test('Bank without a merchant: merchant-only options stay listed but disabled, like the dashboard', async ({ page }) => {
  // Failure mode: hiding these rows makes the list differ from the
  // dashboard's bank menu, which shows them disabled.
  const server = bankServer()
  server.merchantCharacter = null
  await server.install(page)

  await page.goto('/bank')
  await page.getByRole('button', { name: /Iron Ore x5/ }).click()
  for (const name of ['Mark for withdrawal', 'Mark all for withdrawal', 'Auto mark for stand…', 'Auto sell to NPC…', 'Clear all marks']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeDisabled()
  }
  await expect(page.getByRole('button', { name: 'Sell to NPC…', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Sell to NPC…', exact: true })).toHaveClass(/text-rose-400/)
})
