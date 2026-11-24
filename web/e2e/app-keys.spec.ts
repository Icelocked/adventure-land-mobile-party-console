import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// OWNERS-PORT-MAP.md B18: Account > Apps (app-keys-settings.tsx) over /apps, /apps/:name/revoke
// and /apps/:name/own-commands, and the app locks through the settings route.

test('Apps issues a key shown once, switches its own commands, revokes it, and locks a setting', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 70 })
  await server.install(page)
  const posts: { path: string; body: unknown }[] = []
  page.on('request', (request) => {
    const match = request.url().match(/\/party-api\/(apps.*)$/)
    if (request.method() === 'POST' && match) posts.push({ path: match[1], body: request.postDataJSON() })
  })
  await page.goto('/settings/menu?tab=account&section=apps')
  const apps = page.getByRole('region', { name: 'Apps' })
  await apps.getByRole('textbox', { name: 'App name' }).fill('Tracker')
  await apps.getByRole('checkbox', { name: 'Change settings' }).check()
  await apps.getByRole('button', { name: 'Issue key' }).click()
  await expect.poll(() => posts.at(-1)).toEqual({ path: 'apps', body: { name: 'Tracker', scopes: ['read', 'settings'], ownCommands: false } })
  await expect(page.getByTestId('issued-app-key')).toHaveText('Key for Tracker, shown only now: key-Tracker')
  const row = page.getByTestId('app-key')
  await expect(row).toContainText('Read state, Change settings')
  await expect(row).toContainText('Last used never')

  await row.getByRole('checkbox', { name: 'Counts as my own commands' }).click()
  await expect.poll(() => posts.at(-1)).toEqual({ path: 'apps/Tracker/own-commands', body: { ownCommands: true } })
  await expect(row.getByRole('checkbox', { name: 'Counts as my own commands' })).toBeChecked()

  await apps.getByText('Settings locked against apps').click()
  await apps.getByRole('checkbox', { name: 'Home realm' }).click()
  await expect.poll(() => server.settingsWrites.at(-1)?.changes).toEqual([{ field: 'appLocks', value: ['homeRealm'] }])

  await row.getByRole('button', { name: 'Revoke' }).click()
  await expect.poll(() => posts.at(-1)).toEqual({ path: 'apps/Tracker/revoke', body: {} })
  await expect(page.getByTestId('app-key')).toHaveCount(0)
})

test('Apps shows the console refusal for a second key under a live name', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 70 })
  server.appKeys = [{ name: 'Tracker', scopes: ['read'], ownCommands: false, issuedAt: 1, lastUsedAt: null, revokedAt: null }]
  await server.install(page)
  await page.goto('/settings/menu?tab=account&section=apps')
  const apps = page.getByRole('region', { name: 'Apps' })
  await apps.getByRole('textbox', { name: 'App name' }).fill('Tracker')
  await apps.getByRole('button', { name: 'Issue key' }).click()
  await expect(apps.getByRole('alert')).toHaveText('Tracker already has a key; revoke it first')
})
