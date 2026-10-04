import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function postBodies(page: Page, suffix: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(suffix)) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

function settingsServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60, diagnostics: { characterDollHtml: '<div><img src="/e2e-sprite.png"></div>' } })
  server.offlineRoster = [{ name: 'Sleepy', ctype: 'mage', level: 42 }]
  server.extraState = { bankbois: [{ name: 'Bankboi0', ctype: 'merchant', level: 1, state: 'ready', items: [] }] }
  return server
}

test('Settings: account grid with appearances, bankbois and empty slots; Create character opens the creator', async ({ page }) => {
  const server = settingsServer()
  await server.install(page)
  await page.goto('/settings')

  const characters = page.getByRole('region', { name: 'Characters' })
  await expect(characters.getByLabel('Leada')).toContainText('warrior · Lv 60')
  await expect(characters.getByLabel('Sleepy')).toContainText('Appearance saved after first connection')
  await expect(characters.getByLabel('Sleepy')).toContainText('mage · Lv 42')
  await expect(characters.getByLabel('Bankboi0')).toContainText('merchant · Lv 1')
  await expect(characters.getByLabel('Empty character slot')).toHaveCount(5)
  await characters.getByRole('button', { name: 'Create character' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('Settings: state import previews, guards size, imports with the digest, and exports', async ({ page }) => {
  const server = settingsServer()
  await server.install(page)
  await page.goto('/settings')

  const section = page.getByRole('region', { name: 'Dashboard state import/export' })
  await expect(section.getByText('/srv/console/caraGarage.jsonl')).toBeVisible()

  await section.getByLabel('Import state file').setInputFiles({ name: 'big.jsonl', mimeType: 'text/plain', buffer: Buffer.alloc(2000, 'a') })
  await expect(section.getByRole('alert')).toHaveText('Error reading state file: Choose a state file smaller than 128 MB.')

  await section.getByLabel('Import state file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('broken') })
  await expect(section.getByRole('alert')).toHaveText('Error reading state file: Unrecognized state file')

  await section.getByLabel('Import state file').setInputFiles({ name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from('{"v":1}') })
  const review = section.getByRole('group', { name: 'Review settings.json' })
  await expect(review.getByText('Characters: Leada')).toBeVisible()
  await expect(review.getByText('Skipping Stranger (not in this account): Automatic collection rules.')).toBeVisible()
  await expect(review.getByText('Bank collection marks')).toBeVisible()
  await expect(review.getByText('Farming Policy')).toBeVisible()
  await review.getByRole('button', { name: 'Import dashboard state' }).click()
  await expect(section.getByText('Dashboard state imported. Skipped: Stranger. Backup: /srv/backups/state-1.jsonl')).toBeVisible()
  expect(server.stateImports.at(-1)).toEqual({ action: 'import', body: '{"v":1}', digest: 'd1' })
  expect(server.stateImports.at(-2)).toMatchObject({ action: 'preview', digest: null })

  await page.evaluate(() => {
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })
  const download = page.waitForEvent('download')
  await section.getByRole('button', { name: 'Export state file' }).click()
  expect((await download).suggestedFilename()).toMatch(/^party_console_settings_.*\.json$/)
})

test('Settings: hosting pairing, console updates and the debug instance', async ({ page }) => {
  const server = settingsServer()
  server.consoleUpdate = { current: '1.2.0', available: '1.3.0', notes: 'https://example.com/notes', managed: true, automatic: false, phase: 'available' }
  await server.install(page)
  const pairing = postBodies(page, '/setup/pairing')
  await page.goto('/settings')

  const hosting = page.getByRole('region', { name: 'Hosting' })
  await hosting.getByRole('checkbox', { name: 'Require secure pairing' }).click()
  await expect.poll(() => pairing[0]).toEqual({ requirePairing: true })
  await expect(hosting.getByText(/^This browser is authorized/)).toBeVisible()

  const updates = page.getByRole('region', { name: 'Adventureland Party Console' })
  await expect(updates.getByText('Installed version: 1.2.0')).toBeVisible()
  await expect(updates.getByText('New release available: 1.3.0')).toBeVisible()
  await expect(updates.getByRole('link', { name: 'Release notes' })).toHaveAttribute('href', 'https://example.com/notes')
  await updates.getByRole('button', { name: 'Download and install update' }).click()
  await updates.getByRole('checkbox', { name: 'Automatically download and install new versions when available' }).click()
  await expect.poll(() => server.consoleActions.map((a) => a.name)).toEqual(['download', 'preferences'])
  expect(server.consoleActions[1].body).toEqual({ automatic: true })

  server.consoleUpdate = { ...server.consoleUpdate, phase: 'ready' }
  await updates.getByRole('button', { name: 'Restart now' }).click()
  await expect.poll(() => server.consoleActions.at(-1)?.name).toBe('restart')

  await expect(updates.getByLabel('Debug instance status')).toHaveText('Ready')
  await updates.getByRole('button', { name: 'Start debug instance' }).click()
  await expect(updates.getByRole('link', { name: 'Open debug console' })).toHaveAttribute('href', /:9100\/#debug=tok$/)
  await updates.getByRole('button', { name: 'Stop running' }).click()
  await expect(updates.getByRole('button', { name: 'Start debug instance' })).toBeVisible()
})

test('Settings: a development checkout only notifies; the ALData auth mail starts the verification wait until CORRECT', async ({ page }) => {
  const server = settingsServer()
  server.consoleUpdate = { current: '1.2.0', managed: false, automatic: false, phase: 'idle', checkedAt: Date.now() }
  server.extraState = { ...server.extraState, aldata: { listings: [], hasKey: true, auth: 'NO' } }
  await server.install(page)
  await page.route('**/party-api/aldata/key', (route) => route.fulfill({ json: { key: 'secret-key' } }))
  let auth = 'PENDING'
  await page.route('**/party-api/aldata/auth', (route) => route.fulfill({ json: { auth } }))
  await page.clock.install()
  await page.goto('/settings')
  const updates = page.getByRole('region', { name: 'Adventureland Party Console' })
  await expect(updates.getByText('Up to date.')).toBeVisible()
  await expect(updates.getByText(/^Development checkout: update notifications only/)).toBeVisible()
  await expect(updates.getByRole('checkbox', { name: /Automatically download/ })).toBeDisabled()

  await page.getByRole('button', { name: 'Prepare mail' }).click()
  const compose = page.getByRole('region', { name: 'Write message' })
  await compose.getByRole('button', { name: 'Send mail' }).click()
  await compose.getByRole('button', { name: 'Really send mail?' }).click()
  await expect.poll(() => server.lastOrder?.subject).toBe('aldata_auth')
  await page.goBack()
  await expect(page.getByText('Waiting for mail delivery and ALData verification… Do not resend; each message costs gold.')).toBeVisible()
  await expect(page.getByText(/^Auth: PENDING/)).toBeVisible()
  auth = 'CORRECT'
  await page.clock.runFor(16_000)
  await expect(page.getByText(/^Auth: CORRECT/)).toBeVisible()
  await expect(page.getByText(/^Waiting for mail delivery/)).toHaveCount(0)
})

test('Debug instance: the party screen shows the debug banner with the game client link', async ({ page }) => {
  const server = settingsServer()
  server.consoleDebug = { phase: 'running', message: 'Inside debug', insideDebug: true }
  await server.install(page)
  await page.goto('/')
  await expect(page.getByText('Debug instance · god party · unlimited Cave visits')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open game client' })).toHaveAttribute('href', /\/debug-game\/vnc\.html\?autoconnect=1&resize=scale&path=debug-game\/websockify$/)
  // character-session-controls.tsx: the session controls become the debug browser link.
  await page.goto('/characters/Leada')
  await expect(page.getByRole('link', { name: /^Leada · Debug browser/ })).toBeVisible()
})

test('Settings parity: description, stored ALData key loaded for Copy, auth wait keeps polling away from Settings, realm panel before data, update ! focuses the update section', async ({ page }) => {
  const server = settingsServer()
  server.consoleUpdate = { current: '1.2.0', available: '1.3.0', managed: true, automatic: false, phase: 'available' }
  server.extraState = { ...server.extraState, aldata: { listings: [], hasKey: true, auth: 'NO' } }
  await server.install(page)
  await page.route('**/party-api/aldata/key', (route) => route.fulfill({ json: { key: 'secret-key' } }))
  let auth = 'PENDING'
  let authReads = 0
  await page.route('**/party-api/aldata/auth', (route) => {
    authReads++
    return route.fulfill({ json: { auth } })
  })
  await page.clock.install()
  await page.goto('/')
  await page.getByRole('button', { name: 'New version available' }).click()
  await expect(page.locator('#console-updates')).toBeFocused()
  await expect(page.getByText('Manage saved dashboard state, character connections, and market access.')).toBeVisible()
  await expect(page.getByText(/^Current: Unknown/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy key' })).toBeEnabled()
  await expect(page.getByText(/Review the postage and click Send; your merchant will send it\./)).toBeVisible()

  await page.getByRole('button', { name: 'Prepare mail' }).click()
  const compose = page.getByRole('region', { name: 'Write message' })
  await compose.getByRole('button', { name: 'Send mail' }).click()
  await compose.getByRole('button', { name: 'Really send mail?' }).click()
  await expect.poll(() => authReads).toBeGreaterThan(0)
  const before = authReads
  auth = 'CORRECT'
  await page.clock.runFor(16_000)
  await expect.poll(() => authReads).toBeGreaterThan(before)
  await page.goBack()
  await expect(page.getByText(/^Auth: CORRECT/)).toBeVisible()
  await expect(page.getByText(/^Waiting for mail delivery/)).toHaveCount(0)
})
