import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

type UpdateState = { current: string; available?: string; notes?: string; checkedAt?: number; automatic: boolean; managed: boolean; updater: boolean; phase: string; error?: string }

async function mockUpdates(page: import('@playwright/test').Page, state: UpdateState) {
  const calls: { path: string; body: unknown }[] = []
  await page.route('**/notify/update**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/notify/update', '')
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>
      calls.push({ path, body })
      if (path === '/check') Object.assign(state, { available: '1.1.0', notes: 'https://github.com/x/y/releases/tag/v1.1.0', checkedAt: Date.now(), phase: 'available' })
      if (path === '/install') state.phase = 'installing'
      if (path === '/preferences') state.automatic = body.automatic === true
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state) })
  })
  return calls
}

test('Settings: PWA updates check, install and toggle automatic installs', async ({ page }) => {
  // Failure modes: Check now doesn't reach the updater; Install is offered
  // without the updater service; the automatic checkbox doesn't persist.
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  await server.install(page)
  const calls = await mockUpdates(page, { current: '1.0.0', automatic: false, managed: true, updater: true, phase: 'idle', checkedAt: Date.now() })

  await page.goto('/settings')
  const panel = page.getByRole('region', { name: 'Party Console PWA' })
  await expect(panel.getByText('Installed version: 1.0.0')).toBeVisible()
  await expect(panel.getByRole('status')).toHaveText('Up to date.')
  await expect(panel.getByRole('button', { name: 'Download and install update' })).toHaveCount(0)

  await panel.getByRole('button', { name: 'Check now' }).click()
  await expect(panel.getByText('New release available: 1.1.0')).toBeVisible()
  await expect(panel.getByRole('link', { name: 'Release notes' })).toHaveAttribute('href', /releases\/tag\/v1\.1\.0$/)

  await panel.getByRole('checkbox', { name: /Automatically download and install/ }).check()
  await expect(panel.getByRole('checkbox', { name: /Automatically download and install/ })).toBeChecked()

  await panel.getByRole('button', { name: 'Download and install update' }).click()
  await expect(panel.getByRole('status')).toContainText('Installing')
  // Settings stay locked while an install runs.
  await expect(panel.getByRole('checkbox', { name: /Automatically download and install/ })).toBeDisabled()
  expect(calls.map((call) => call.path)).toEqual(['/check', '/preferences', '/install'])
  expect(calls[1].body).toEqual({ automatic: true })
})

test('Settings: without the updater service, updates are notices only', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  await server.install(page)
  await mockUpdates(page, { current: '1.0.0', available: '1.1.0', automatic: false, managed: false, updater: false, phase: 'available', checkedAt: Date.now() })

  await page.goto('/settings')
  const panel = page.getByRole('region', { name: 'Party Console PWA' })
  await expect(panel.getByText('New release available: 1.1.0')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Download and install update' })).toHaveCount(0)
  await expect(panel.getByRole('checkbox', { name: /Automatically download and install/ })).toBeDisabled()
  await expect(panel.getByText(/needs the updater service/)).toBeVisible()
})

test('WTB: placing an order fails once with a server error, then succeeds, then can be cancelled', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.addCatalogEntry({ id: 'ironore', name: 'Iron Ore' })
  await server.install(page)

  await page.goto('/wtb')
  await expect(page.getByText('No active orders.')).toBeVisible()

  await page.getByRole('button', { name: 'New WTB order' }).click()
  await page.getByPlaceholder('Search every item…').fill('Iron Ore')
  await page.getByText('Iron Ore').click()
  await page.getByLabel('Maximum price').fill('500')

  server.failOnce['merchant/bid'] = 'Stand is full'
  await page.getByRole('button', { name: 'Place WTB' }).click()
  await expect(page.getByText('Stand is full')).toBeVisible()
  // The form stays open on failure; the order was not placed.
  await expect(page.getByRole('button', { name: 'Place WTB' })).toBeVisible()

  await page.getByRole('button', { name: 'Place WTB' }).click()
  await expect(page.getByRole('button', { name: 'Place WTB' })).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit price for Iron Ore' })).toHaveText('500g')

  // stand-sheet.tsx: cancel asks "Really cancel?" first.
  const order = page.getByRole('group', { name: 'WTB Iron Ore' })
  await order.getByRole('button', { name: 'Cancel', exact: true }).click()
  await order.getByRole('button', { name: 'Really cancel?' }).click()
  await expect(page.getByText('No active orders.')).toBeVisible()
})

test('Skills: search, range labels, and the full definition of a skill', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.skillCatalog = [
    {
      id: 'warrior',
      name: 'Warrior',
      skills: [
        { id: 'cleave', name: 'Cleave', definition: { range: 100, range_multiplier: 2, range_bonus: 10, mp: 20, cooldown: 4000, explanation: 'Hits everything nearby' } },
        { id: 'charge', name: 'Charge', definition: { use_range: true, range_multiplier: 1.5, range_bonus: -5 } },
      ],
    },
    {
      id: 'skills',
      name: 'Shared',
      skills: [
        { id: 'throw', name: 'Throw', definition: { range: 200 } },
        { id: 'blink', name: 'Blink', definition: { global: true } },
        { id: 'emote', name: 'Emote', definition: {} },
      ],
    },
  ]
  await server.install(page)

  await page.goto('/skills')
  const warrior = page.getByRole('region', { name: 'Warrior' })
  await expect(warrior.getByRole('button', { name: /^Cleave cleave Range: 210$/ })).toBeVisible()
  await expect(warrior.getByRole('button', { name: /^Charge charge Range: 1\.5 × attack range − 5$/ })).toBeVisible()
  const shared = page.getByRole('region', { name: 'Shared' })
  await expect(shared.getByRole('button', { name: /Range: 200 \+ character level$/ })).toBeVisible()
  await expect(shared.getByRole('button', { name: /Range: Global$/ })).toBeVisible()
  await expect(shared.getByRole('button', { name: /Range: Not specified$/ })).toBeVisible()

  await page.getByPlaceholder('Search classes or skills…').fill('warrior')
  await expect(shared).toHaveCount(0)
  await expect(warrior.getByRole('button')).toHaveCount(2)

  await warrior.getByRole('button', { name: /^Cleave/ }).click()
  const details = page.getByRole('group', { name: 'Skill details' })
  await expect(details.getByText('G.skills.cleave')).toBeVisible()
  await expect(details.getByText('Hits everything nearby')).toBeVisible()
  await expect(details.getByText('210', { exact: true })).toBeVisible()
  await expect(details.getByText('4s', { exact: true })).toBeVisible()
})

test('Routines: moving a routine up changes its saved priority order', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.merchantRoutinePriorities = { fishing: 30, mining: 20 }
  server.merchantAutomations = { fishing: true, mining: true }
  await server.install(page)

  await page.goto('/routines')
  await page.getByRole('button', { name: 'Move Mining up' }).click()
  await page.getByRole('button', { name: 'Save routines' }).click()

  await expect.poll(() => server.lastRoutineSave?.priorities).toBeTruthy()
  const priorities = server.lastRoutineSave!.priorities as Record<string, number>
  expect(priorities.mining).toBeGreaterThan(priorities.fishing)
})

test('Settings: switching realm updates immediately (no stale data until the next poll)', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  server.realmControl = {
    activeRealm: 'US I',
    currentRealm: 'US I',
    homeRealm: 'US I',
    split: false,
    characters: [],
    realms: [
      { key: 'US I', label: 'US I', players: 80, pvp: false },
      { key: 'US II', label: 'US II', players: 50, pvp: false },
    ],
  }
  await server.install(page)

  await page.goto('/settings')
  await expect(page.getByText('Current: US I · Home: US I')).toBeVisible()
  await page.getByText('Change realm…').click()
  // The realm the party is already in can't be picked.
  await expect(page.getByRole('button', { name: 'US I (80 players)' })).toBeDisabled()
  await page.getByText('US II (50 players)').click()
  // party-inventory-panels.tsx: a confirmation with the Fatigue/Hop Sickness warnings first.
  await page.getByRole('group', { name: 'Switch realm?' }).getByRole('button', { name: 'Switch all characters' }).click()

  await expect(page.getByText('Current: US II · Home: US I')).toBeVisible()
})

test('Settings: About credits party-console and shows its license', async ({ page }) => {
  // Failure mode: the app shipped party-console-derived code without its
  // MIT notice or any credit.
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Merchantina', ctype: 'merchant', level: 30 })
  await server.install(page)
  await page.goto('/settings')
  const about = page.getByRole('region', { name: 'About' })
  await expect(about.getByRole('link', { name: 'Adventureland Party Console' })).toHaveAttribute('href', 'https://github.com/Ryan-Haines/adventureland-party-console')
  await expect(about.getByText(/by Ryan Haines and contributors/)).toBeVisible()
  await about.getByRole('button', { name: 'Show party-console license' }).click()
  await expect(about.getByText(/Copyright \(c\) 2026 Adventure Land Party Console contributors/)).toBeVisible()
})
