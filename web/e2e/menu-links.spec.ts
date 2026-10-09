import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Menu links: none by default; a saved link shows in the account menu, opens its page, and can be removed', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Warrior', ctype: 'warrior', level: 60 })
  await server.install(page)
  // The page the link opens is hosted by the same server, outside this app.
  await page.route('**/tools/', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Tools</title><h1>Server tools</h1>' }))

  await page.goto('/')
  await page.getByRole('button', { name: 'Menu' }).first().click()
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Server tools' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Settings' }).click()

  const section = page.getByRole('region', { name: 'Menu links' })
  await section.getByLabel('Link label').fill('Server tools')
  await section.getByLabel('Link path').fill('https://example.com/')
  await section.getByRole('button', { name: 'Add' }).click()
  await expect(section.getByRole('alert')).toHaveText('Enter a path on this site, starting with /')
  await section.getByLabel('Link path').fill('/tools/')
  await section.getByRole('button', { name: 'Add' }).click()
  await expect(section.getByText('/tools/')).toBeVisible()

  await page.goto('/')
  await page.getByRole('button', { name: 'Menu' }).first().click()
  await page.getByRole('button', { name: 'Server tools' }).click()
  await expect(page).toHaveURL(/\/tools\/$/)
  await expect(page.getByRole('heading', { name: 'Server tools' })).toBeVisible()

  await page.goto('/settings')
  await page.getByRole('region', { name: 'Menu links' }).getByRole('button', { name: 'Remove' }).click()
  await page.goto('/')
  await page.getByRole('button', { name: 'Menu' }).first().click()
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Server tools' })).toHaveCount(0)
})
