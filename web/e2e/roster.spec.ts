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

function withSlots() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.extraState = {
    activeSlots: [
      { index: 0, kind: 'native', primary: true, character: 'Ranger1', state: 'online' },
      { index: 1, kind: 'headless', character: null, state: 'empty' },
    ],
    classChoices: ['ranger', 'priest'],
    appearanceChoices: { ranger: [{ index: 0, html: '<i>r0</i>' }], priest: [{ index: 0, html: '<i>p0</i>' }] },
  }
  return server
}

test('Roster: an empty slot loads an offline roster member headless, or into Steam', async ({ page }) => {
  const server = withSlots()
  // An offline roster member (not in a slot), and one online elsewhere (hidden).
  server.offlineRoster = [
    { name: 'Priest1', ctype: 'priest', level: 40 },
    { name: 'Elsewhere', ctype: 'mage', level: 30, online: true },
  ]
  await server.install(page)
  const bodies = posts(page)

  await page.goto('/')
  await page.getByRole('button', { name: 'Load character slot 2' }).click()
  await expect(page.getByText('Choose a roster member')).toBeVisible()
  await expect(page.getByRole('button', { name: /Elsewhere/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Ranger1/ })).toHaveCount(0)
  await page.getByRole('button', { name: /Priest1/ }).click()
  await expect.poll(() => bodies.find((b) => b.path === 'slots/1/spawn')?.body).toEqual({ character: 'Priest1' })

  await page.getByRole('button', { name: 'Load character slot 2' }).click()
  await page.getByRole('button', { name: 'Steam', exact: true }).click()
  await page.getByRole('button', { name: /Priest1/ }).click()
  await expect.poll(() => bodies.find((b) => b.path === 'steam/action')?.body).toEqual({ character: 'Priest1', action: 'login' })
})

test('Roster: Create character validates the name and posts name, class and look', async ({ page }) => {
  const server = withSlots()
  await server.install(page)
  const bodies = posts(page)

  await page.goto('/')
  await page.getByRole('button', { name: 'Load character slot 2' }).click()
  await page.getByRole('button', { name: 'Create character' }).click()
  const create = page.getByRole('button', { name: 'Create and spawn' })
  await page.getByPlaceholder('NewRanger').fill('abc')
  await expect(create).toBeDisabled()
  await page.getByPlaceholder('NewRanger').fill('New_Priest')
  await page.getByRole('combobox', { name: 'Class' }).selectOption('priest')
  await create.click()
  await expect.poll(() => bodies.find((b) => b.path === 'roster/create')?.body).toEqual({ name: 'New_Priest', class: 'priest', look: 0 })
})

test('Session controls: log out asks first, then logs a Steam character out through steam/action', async ({ page }) => {
  const server = withSlots()
  await server.install(page)
  const bodies = posts(page)

  await page.goto('/characters/Ranger1')
  await page.getByRole('button', { name: 'Log out Ranger1' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Log out Ranger1?' })
  await expect(dialog.getByText(/stops the character and its automation/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await page.waitForTimeout(300)
  expect(bodies.filter((b) => b.path === 'steam/action')).toHaveLength(0)

  await page.getByRole('button', { name: 'Log out Ranger1' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Log out' }).click()
  await expect.poll(() => bodies.find((b) => b.path === 'steam/action')?.body).toEqual({ character: 'Ranger1', action: 'logout' })
})

test('Session controls: a headless character logs out through its slot', async ({ page }) => {
  const server = withSlots()
  server.extraState = { ...server.extraState, activeSlots: [{ index: 2, kind: 'headless', character: 'Ranger1', state: 'online' }] }
  await server.install(page)
  const bodies = posts(page)

  await page.goto('/characters/Ranger1')
  await page.getByRole('button', { name: 'Log out Ranger1' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Log out' }).click()
  await expect.poll(() => bodies.find((b) => b.path === 'slots/2/logout')?.body).toEqual({})
})

test('Pending: a slot whose character has not connected shows a waiting card; a failed Steam handoff offers recovery', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.extraState = {
    activeSlots: [
      { index: 0, kind: 'native', primary: true, character: 'Ranger1', state: 'online' },
      { index: 1, kind: 'headless', character: 'Mage1', state: 'starting' },
    ],
    steamSwitch: { from: 'Ranger1', target: 'Mage1', startedAt: Date.now(), timedOut: false, phase: 'failed', error: 'navigate timed out' },
  }
  await server.install(page)
  const bodies = posts(page)

  await page.goto('/')
  await expect(page.getByRole('listitem').filter({ hasText: 'Mage1' }).getByText('Waiting for your character to connect…')).toBeVisible()
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Recover Steam handoff after characters are offline' }).click()
  await expect.poll(() => bodies.some((b) => b.path === 'steam/recover')).toBe(true)
})
