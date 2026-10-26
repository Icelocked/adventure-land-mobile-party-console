import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// Console fork Pause, Play and clean shutdown (b33aee77): the header's
// buttons post /console-control/:action as console-controls.tsx does, and
// core's consoleControl drives the indicator, the sheet and the resume banner.

function partyServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  server.addCharacter({ name: 'Folla', ctype: 'priest', level: 58 })
  return server
}

const header = (page: Page) => page.getByRole('banner')

test('Pause shows the Paused indicator and Play removes it', async ({ page }) => {
  const server = partyServer()
  await server.install(page)
  await page.goto('/')
  await header(page).getByRole('button', { name: 'Pause all automated actions' }).click()
  await expect(header(page).locator('[data-console-paused]')).toHaveText('Paused')
  expect(server.consoleControlActions).toEqual([{ action: 'pause', body: {} }])
  await page.reload()
  await expect(header(page).locator('[data-console-paused]')).toHaveText('Paused')
  await header(page).getByRole('button', { name: 'Play: resume automated actions' }).click()
  await expect(header(page).locator('[data-console-paused]')).toBeHidden()
  await expect(header(page).getByRole('button', { name: 'Pause all automated actions' })).toBeVisible()
  expect(server.consoleControlActions.map((entry) => entry.action)).toEqual(['pause', 'play'])
})

test('Clean shutdown: a fight defers it, Force asks to confirm, and Safe to stop shows the stop command', async ({ page }) => {
  const server = partyServer()
  server.shutdownHold = 'Cave run'
  await server.install(page)
  await page.goto('/')
  await header(page).getByRole('button', { name: 'Clean shutdown' }).click()
  const sheet = page.getByRole('dialog', { name: 'Clean shutdown' })
  await expect(sheet).toContainText('The console resumes the same activity after its next start.')
  await sheet.getByRole('button', { name: 'Start clean shutdown' }).click()
  await expect(sheet).toContainText('Waiting for the fight to end: Cave run.')
  await sheet.getByRole('button', { name: 'Force shutdown' }).click()
  await expect(sheet).toContainText('They only defend themselves until the console resumes.')
  await sheet.getByRole('button', { name: 'Confirm: stop now' }).click()
  await expect(sheet).toContainText('Pausing and saving the state.')
  await expect(sheet).toContainText('Waiting for: Leada, Folla')
  expect(server.consoleControlActions).toEqual([
    { action: 'shutdown', body: {} },
    { action: 'shutdown', body: { force: true } },
  ])
  // The characters acknowledged: the next core poll reports safe.
  server.consoleControl = { ...server.consoleControl, shutdown: { ...server.consoleControl.shutdown!, phase: 'safe', waiting: [] } }
  const safe = page.getByRole('dialog', { name: 'Safe to stop' })
  await expect(safe.locator('[data-console-stop-command]')).toHaveText('docker compose stop party-console')
  await expect(safe).toContainText('In /opt/party-console:')
  await expect(page.locator('[data-console-paused]')).toHaveText('Safe to stop')
  await safe.getByRole('button', { name: 'Cancel shutdown' }).click()
  await expect(safe).toBeHidden()
  expect(server.consoleControlActions.at(-1)).toEqual({ action: 'cancel-shutdown', body: {} })
})

test('After a restart the resume banner names the characters it waits for, and Cancel keeps the console paused', async ({ page }) => {
  const server = partyServer()
  server.consoleControl = { ...server.consoleControl, paused: true, pausedAt: Date.now(), resume: { since: Date.now(), waiting: ['Folla'] } }
  await server.install(page)
  await page.goto('/')
  const banner = page.locator('[data-console-resuming]')
  await expect(banner).toContainText('Resuming previous activity · waiting for Folla')
  await expect(header(page).locator('[data-console-paused]')).toHaveText('Resuming')
  await banner.getByRole('button', { name: 'Cancel' }).click()
  await expect(banner).toBeHidden()
  await expect(header(page).locator('[data-console-paused]')).toHaveText('Paused')
  expect(server.consoleControlActions).toEqual([{ action: 'cancel-resume', body: {} }])
})

test('v1.4.0 has no console controls', async ({ page }) => {
  const server = partyServer()
  server.consoleKind = 'v1.4.0'
  await server.install(page)
  await page.goto('/')
  await expect(page.getByText('Leada').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause all automated actions' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Clean shutdown' })).toHaveCount(0)
})
