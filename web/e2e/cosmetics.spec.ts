import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function commands(page: Page): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/party-api/command')) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

const sprite = { url: '/e2e-sprite.png', tileSize: 8, columns: 1, rows: 1, x: 0, y: 0 }

// characters/shared.js cosmeticsSnapshot(), as served in core characterDetails.
function cosmetics() {
  return {
    jars: [
      { inventorySlot: 4, data: 'hat221', kind: 'appearance', type: 'hat', slot: 'hat', label: 'hat221', sprite, locked: false, usable: true },
      { inventorySlot: 9, data: null, kind: 'empty', type: null, slot: null, locked: false, usable: false },
    ],
    owned: [
      { name: 'hat221', kind: 'appearance', type: 'hat', slot: 'hat', label: 'hat221', sprite, count: 1 },
      { name: 'makeup117', kind: 'appearance', type: 'face', slot: 'face', label: 'makeup117', count: 2 },
      { name: 'emotion_wink', kind: 'emote', type: 'emote', slot: null, label: 'Wink', explanation: 'A cheeky wink', mp: 10, cooldownMs: 3000, range: 120, noSelf: true, cooldownLeftMs: 0, count: 1 },
      { name: 'emotion_wave', kind: 'emote', type: 'emote', slot: null, label: 'Wave', cooldownMs: 120000, range: null, cooldownLeftMs: 45000, count: 1 },
    ],
    worn: { skin: 'mranger', hat: 'hat221' },
    nearbyPlayers: [
      { name: 'Friend', distance: 40 },
      { name: 'Faraway', distance: 400 },
    ],
    lastEmote: { name: 'emotion_wink', target: 'Friend', at: 1, ok: false, reason: 'cooldown' },
  }
}

test('Cosmetics: the collapsed summary, then jars, emotes, worn and owned cosmetics post the dashboard commands (cosmetics-panel.tsx)', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50, diagnostics: { cosmetics: cosmetics() } })
  await server.install(page)
  const bodies = commands(page)
  await page.goto('/characters/Ranger1')

  const toggle = page.getByRole('button', { name: 'Cosmetics · 2 CX jars (1 usable) · 2 emotes' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()

  await expect(page.getByText('Slot 4 · hat221 · hat')).toBeVisible()
  await expect(page.getByText('Slot 9 · empty')).toBeVisible()
  await expect(page.getByRole('region', { name: /^Cosmetics/ }).getByText('Empty', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Open CX jar in slot 4' }).click()
  await expect.poll(() => bodies.at(-1)).toEqual({ character: 'Ranger1', type: 'cx-open-jar', inventorySlot: 4 })

  // Wink is ranged and can't target its user, so only Friend (40) is in range.
  const target = page.getByRole('combobox', { name: 'Target for Wink' })
  await expect(target.locator('option')).toHaveText(['Friend · 40'])
  await expect(page.getByText('A cheeky wink · 10 MP · 3s cooldown · range 120')).toBeVisible()
  await page.getByRole('button', { name: 'Use Wink' }).click()
  await expect.poll(() => bodies.at(-1)).toEqual({ character: 'Ranger1', type: 'cx-emote', name: 'emotion_wink', target: 'Friend' })
  // Wave has no range, so it takes no target, and it is cooling down.
  await expect(page.getByRole('combobox', { name: 'Target for Wave' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Use Wave' })).toHaveText('Ready in 45s')
  await expect(page.getByRole('button', { name: 'Use Wave' })).toBeDisabled()
  await expect(page.getByRole('status').filter({ hasText: 'Last emote' })).toHaveText('Last emote: Wink → Friend · refused: cooldown')

  // Skin can't be removed; the hat can.
  await expect(page.getByText('skin · mranger')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Remove mranger/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Remove hat221 from hat' }).click()
  await expect.poll(() => bodies.at(-1)).toEqual({ character: 'Ranger1', type: 'cx-remove', slot: 'hat' })

  await expect(page.getByRole('button', { name: 'Wear hat221' })).toHaveText('Worn')
  await expect(page.getByRole('button', { name: 'Wear hat221' })).toBeDisabled()
  await expect(page.getByText('makeup117 ×2 · face')).toBeVisible()
  await expect(page.getByRole('img', { name: 'makeup117 has no preview' })).toBeVisible()
  await page.getByRole('button', { name: 'Wear makeup117' }).click()
  await expect.poll(() => bodies.at(-1)).toEqual({ character: 'Ranger1', type: 'cx-wear', name: 'makeup117', slot: 'face' })
})

test('Cosmetics: a refused command shows the server error, and a character without a report shows no panel', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50, diagnostics: { cosmetics: cosmetics() } })
  server.addCharacter({ name: 'Mage1', ctype: 'mage', level: 40 })
  await server.install(page)
  await page.goto('/characters/Ranger1')
  await page.getByRole('button', { name: /^Cosmetics ·/ }).click()

  server.failOnce['command'] = 'This character is busy with another command; try again shortly'
  await page.getByRole('button', { name: 'Open CX jar in slot 4' }).click()
  await expect(page.getByRole('alert')).toHaveText('This character is busy with another command; try again shortly')

  await page.goto('/characters/Mage1')
  await expect(page.getByRole('heading', { name: 'Restock' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Cosmetics/ })).toHaveCount(0)
})
