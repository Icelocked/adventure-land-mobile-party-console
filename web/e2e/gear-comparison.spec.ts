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
    diagnostics: { primaryStat: 'dex', str: 20, int: 10, dex: 100, vit: 30, attack: 250, armor: 80, speed: 55, characterDollHtml: '<span data-testid="doll">doll<img src="x" onerror="window.__xss=1"></span>' },
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
  // Sanitized doll markup (lib/safeHtml.ts): rendered, injected handler inert.
  await expect(proposed.getByText('doll', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  // gear-comparison-dialog.tsx project(): DEX moves with the ring, VIT adds HP (48 + level/3 each).
  await expect(current.getByText('DEX', { exact: true }).locator('..')).toContainText('105')
  await expect(proposed.getByText('DEX', { exact: true }).locator('..')).toContainText('110(+5 · +4.8%)')
  await expect(proposed.getByText('HP', { exact: true }).locator('..')).toContainText('3,136(+136 · +4.5%)')
  await expect(proposed.getByText('Attack', { exact: true }).locator('..')).toContainText('250.0')

  // Moving the preview level changes only that side.
  await expect(proposed.getByText('Preview level')).toBeVisible()
})

test('A two-handed weapon drops the offhand, and the current side can leave a one-handed offhand out', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({
    name: 'Warrior1',
    ctype: 'warrior',
    level: 60,
    items: [{ name: 'bigaxe', level: 0 }],
    slots: { mainhand: { item: { name: 'blade', level: 0 } }, offhand: { item: { name: 'dagger', level: 0 } } },
    diagnostics: { primaryStat: 'str', str: 50, attack: 250 },
  })
  const oneHand = { classes: [{ id: 'warrior', name: 'Warrior', hands: 1 }], hands: [1] }
  server.addCatalogEntry({ id: 'blade', name: 'Blade', upgradeable: true, usage: oneHand, properties: { attack: 20 }, definition: { type: 'weapon', name: 'Blade', attack: 20 } })
  server.addCatalogEntry({ id: 'dagger', name: 'Dagger', upgradeable: true, usage: oneHand, properties: { attack: 15 }, definition: { type: 'weapon', name: 'Dagger', attack: 15 } })
  server.addCatalogEntry({ id: 'bigaxe', name: 'Big Axe', upgradeable: true, usage: { classes: [{ id: 'warrior', name: 'Warrior', hands: 2 }], hands: [2] }, properties: { attack: 50 }, definition: { type: 'weapon', name: 'Big Axe', attack: 50 } })
  await server.install(page)

  await page.goto('/characters/Warrior1')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Compare with equipped' }).click()

  const current = page.getByRole('region', { name: 'Currently equipped' })
  const proposed = page.getByRole('region', { name: 'With this item' })
  await expect(proposed.getByText('Two-handed weapon · unequips Dagger')).toBeVisible()
  // gear-comparison-dialog.tsx project(): weapon attack 35 -> 50 scaled by 1 + STR/20.
  await expect(current.getByText('Attack', { exact: true }).locator('..')).toContainText('250.0')
  await expect(proposed.getByText('Attack', { exact: true }).locator('..')).toContainText('302.5(+52.5 · +21.0%)')

  const include = current.getByRole('checkbox', { name: 'include offhand weapon in comparison' })
  await expect(include).toBeChecked()
  await expect(current.getByText('Dagger +0')).toBeVisible()
  await include.uncheck()
  // Without the dagger the current side keeps only the blade's 20 attack.
  await expect(current.getByText('Attack', { exact: true }).locator('..')).toContainText('197.5')
  await expect(proposed.getByText('Attack', { exact: true }).locator('..')).toContainText('302.5(+105.0 · +53.2%)')
})

test('Set bonuses apply at the exact piece count, not cumulatively', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({
    name: 'Ranger1',
    ctype: 'ranger',
    level: 60,
    items: [{ name: 'ringb', level: 0 }],
    slots: { ring1: { item: { name: 'ringa', level: 0 } } },
    diagnostics: { primaryStat: 'dex', dex: 100 },
  })
  const set = {
    id: 'pair',
    name: 'Ring Pair',
    items: [{ id: 'ringa' }, { id: 'ringb' }],
    bonuses: [
      { pieces: 1, stats: { dex: 3 } },
      { pieces: 2, stats: { dex: 10 } },
    ],
  }
  server.addCatalogEntry({ id: 'ringa', name: 'Ring A', compoundable: true, world: { set }, definition: { type: 'ring', name: 'Ring A' } })
  server.addCatalogEntry({ id: 'ringb', name: 'Ring B', compoundable: true, world: { set }, definition: { type: 'ring', name: 'Ring B' } })
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await page.getByTestId('inventory-slot-0').click()
  await page.getByRole('button', { name: 'Compare with equipped' }).click()
  await page.getByRole('button', { name: /Ring 2/ }).click()

  const proposed = page.getByRole('region', { name: 'With this item' })
  // G.sets[2] replaces G.sets[1]: DEX goes up by 10 - 3, not by 10.
  await expect(proposed.getByText('DEX', { exact: true }).locator('..')).toContainText('107(+7 · +7.0%)')
  const sets = page.getByRole('region', { name: 'Set changes' })
  await expect(sets).toContainText('Ring Pair: 1/2 → 2/2')
  await expect(sets).toContainText('1 pieces: DEX +3 · LOST')
  await expect(sets).toContainText('2 pieces: DEX +10 · GAINED')
})
