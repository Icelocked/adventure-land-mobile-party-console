import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Compare with equipped projects the character totals from its diagnostics, per picked slot', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({
    name: 'Ranger1',
    ctype: 'ranger',
    level: 60,
    max_hp: 3000,
    items: [{ name: 'ringb', level: 0 }],
    slots: { ring1: { item: { name: 'ringa', level: 0 } } },
    diagnostics: { primaryStat: 'dex', str: 20, int: 10, dex: 100, vit: 30, attack: 250, armor: 80, speed: 55, characterDollHtml: '<span data-testid="doll">doll</span>' },
  })
  server.addCatalogEntry({ id: 'ringa', name: 'Ring A', compoundable: true, definition: { type: 'ring', name: 'Ring A', dex: 5 } })
  server.addCatalogEntry({ id: 'ringb', name: 'Ring B', compoundable: true, definition: { type: 'ring', name: 'Ring B', dex: 10, vit: 2 } })
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Compare with equipped' }).click()
  await page.getByRole('button', { name: /Ring 1\s*Ring A/ }).click()

  const current = page.getByRole('region', { name: 'Currently equipped' })
  const proposed = page.getByRole('region', { name: 'With this item' })
  await expect(current.getByText('Ring A +0')).toBeVisible()
  await expect(proposed.getByText('Replaces ring1 · Ring A')).toBeVisible()
  await expect(proposed.getByTestId('doll')).toBeVisible()
  // gear-comparison-dialog.tsx project(): DEX moves with the ring, VIT adds HP (48 + level/3 each).
  await expect(current.getByText('DEX', { exact: true }).locator('..')).toContainText('105')
  await expect(proposed.getByText('DEX', { exact: true }).locator('..')).toContainText('110(+5 · +4.8%)')
  await expect(proposed.getByText('HP', { exact: true }).locator('..')).toContainText('3,136(+136 · +4.5%)')
  await expect(proposed.getByText('Attack', { exact: true }).locator('..')).toContainText('250.0')

  // Moving the preview level changes only that side.
  await expect(proposed.getByText('Preview level')).toBeVisible()
})
