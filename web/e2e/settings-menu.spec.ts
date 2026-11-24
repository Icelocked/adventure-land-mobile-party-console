import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// OWNERS-PORT-MAP.md B2 and B3: the tabbed settings menu (settings-menu.tsx) and its settings,
// each written through POST /settings with the page's basis.

const realms = [
  { key: 'EUI', label: 'EU I', players: 10, pvp: false },
  { key: 'USI', label: 'US I', players: 20, pvp: false },
  { key: 'EUPVP', label: 'EU PVP', players: 5, pvp: true },
]

function setup() {
  const server = new MockPartyServer()
  server.paired = true
  server.leader = 'Leada'
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 70 })
  server.addCharacter({ name: 'Merch', ctype: 'merchant', level: 60 })
  server.realmControl = { split: false, characters: [], realms, currentRealm: 'EUI', homeRealm: 'EUI' }
  return server
}

test("The Farming card's gear opens the menu at the character's Farming section", async ({ page }) => {
  const server = setup()
  await server.install(page)
  await page.goto('/characters/Leada')
  await page.getByRole('region', { name: 'Farming' }).getByRole('button', { name: 'Farming settings', exact: true }).click()
  await expect(page).toHaveURL(/\/settings\/menu\?tab=character&character=Leada&section=farming/)
  await expect(page.getByRole('tablist', { name: 'Settings' }).getByRole('tab', { name: 'Leada' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Farming' })).toHaveAttribute('aria-selected', 'true')
  // The merchant's tab has no Farming section, and Merchant and Routines instead.
  await page.getByRole('tablist', { name: 'Settings' }).getByRole('tab', { name: 'Merch' }).click()
  const sections = page.getByRole('tablist', { name: 'Sections' })
  await expect(sections.getByRole('tab')).toHaveText(['Combat', 'Restock', 'Merchant', 'Routines'])
})

test('Account > Realm saves the home realm and Follow the account saves null', async ({ page }) => {
  const server = setup()
  await server.install(page)
  await page.goto('/settings/menu?tab=account&section=realm')
  const home = page.getByRole('combobox', { name: 'Home realm' })
  await expect(home.locator('option')).toHaveText(['Follow the account (EU I)', 'EU I', 'US I'])
  await home.selectOption('USI')
  await expect.poll(() => server.settingsWrites.at(-1)?.changes).toEqual([{ field: 'homeRealm', value: 'USI' }])
  await expect(page.getByText(/so they get Hop Sickness on US I/)).toBeVisible()
  await home.selectOption('')
  await expect.poll(() => server.settingsWrites.at(-1)?.changes).toEqual([{ field: 'homeRealm', value: null }])
})

test("A character's Combat section writes per-character lines, and an emptied box removes the entry", async ({ page }) => {
  const server = setup()
  server.extraState = { healFirstBelow: { Leada: 40 } }
  await server.install(page)
  await page.goto('/settings/menu?tab=character&character=Leada&section=combat')
  const heal = page.getByRole('textbox', { name: 'Heal first below (% HP) for Leada' })
  await expect(heal).toHaveValue('40')
  await heal.fill('55')
  await heal.press('Enter')
  await expect.poll(() => server.settingsWrites.at(-1)?.changes).toEqual([{ field: 'healFirstBelow', character: 'Leada', value: 55 }])
  const potion = page.getByRole('textbox', { name: 'HP potion below (% HP) for Leada' })
  await potion.fill('abc')
  await potion.blur()
  await expect(page.getByRole('alert')).toHaveText('"abc" is not a number.')
  await heal.fill('')
  await heal.blur()
  await expect.poll(() => server.settingsWrites.at(-1)?.changes).toEqual([{ field: 'healFirstBelow', character: 'Leada', value: null }])
})

test("The merchant's realm blacklist lists every realm but PVP and saves the whole list", async ({ page }) => {
  const server = setup()
  server.extraState = { merchantRealmBlacklist: ['EUI'] }
  await server.install(page)
  await page.goto('/settings/menu?tab=character&character=Merch&section=merchant')
  const list = page.getByRole('group', { name: 'Realm blacklist' })
  await expect(list.getByRole('checkbox')).toHaveCount(2)
  await expect(list.getByRole('checkbox', { name: 'EU I' })).toBeChecked()
  await list.getByRole('checkbox', { name: 'US I' }).click()
  await expect.poll(() => server.settingsWrites.at(-1)?.changes).toEqual([{ field: 'merchantRealmBlacklist', value: ['EUI', 'USI'] }])
  // merchant-trip-setting.tsx's words.
  await expect(page.getByRole('checkbox', { name: 'Marked withdrawals always create merchant jobs' })).toBeChecked()
})
