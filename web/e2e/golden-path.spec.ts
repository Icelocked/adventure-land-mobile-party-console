import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('unpaired browser sees the pairing gate, not the party', async ({ page }) => {
  const server = new MockPartyServer()
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  await server.install(page)

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Pair this device' })).toBeVisible()
  await expect(page.getByText('Merchantina')).not.toBeVisible()
})

test('pairing, then marking an inventory item auto-sell, shows it under Automatic rules with its sprite', async ({ page }) => {
  const server = new MockPartyServer()
  server.addCharacter({
    name: 'Merchantina',
    ctype: 'merchant',
    level: 30,
    items: [{ name: 'wcoat', level: 0 }],
  })
  server.addCatalogEntry({ id: 'wcoat', name: 'Wolf Coat' })
  await server.install(page)

  await page.goto('/')

  // Pair via the manual-paste path (no camera needed in a headless test).
  await page.getByPlaceholder('http://.../setup#...').fill('http://test.local/setup#e2e-test-token')
  await page.getByRole('button', { name: 'Pair this device' }).click()

  await expect(page.getByText('Merchantina')).toBeVisible()
  await page.getByText('Merchantina').click()
  await expect(page).toHaveURL(/\/characters\/Merchantina/)

  // Open the inventory item's action panel and mark it for auto-sell.
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Auto sell to NPC…' }).click()
  await page.getByRole('button', { name: 'Enable auto sale' }).click()

  // The panel closes itself on success (see ItemActionPanel's run()).
  await expect(page.getByRole('button', { name: 'Auto sell to NPC…' })).not.toBeVisible()

  // Automatic rules starts collapsed - expand "Auto NPC sales" and confirm
  // the marked item shows up with both its name AND its sprite (the exact
  // bug this test guards against: AutoMarksSection used to render text
  // only, dropping the sprite the dashboard's own source always shows).
  await page.getByRole('button', { name: /Auto NPC sales \(1\)/ }).click()
  const row = page.locator('div', { hasText: 'Wolf Coat' }).last()
  await expect(row).toBeVisible()
  const sprite = row.locator('div.rounded-md.bg-muted').first()
  await expect(sprite).toHaveCSS('background-image', /e2e-sprite\.png/)
})
