import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

test('Combat log: collapsed until opened, newest 50 first, Clear history empties it', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.combatLogs = {
    Ranger1: Array.from({ length: 55 }, (_, index) => ({ at: 1_700_000_000_000 + index * 1000, type: index % 2 ? 'kill' : 'loot', message: `event ${index}` })),
  }
  await server.install(page)

  await page.goto('/characters/Ranger1')
  const log = page.getByRole('region', { name: 'Combat log' })
  await expect(log.getByText('event 54')).toHaveCount(0)
  await log.getByRole('button', { name: 'Combat log' }).click()
  await expect(log.getByText('55 events')).toBeVisible()
  await expect(log.getByText('event 54')).toBeVisible()
  await expect(log.getByText('event 5', { exact: true })).toBeVisible()
  await expect(log.getByText('event 4', { exact: true })).toHaveCount(0)
  await expect(log.getByText('event 53')).toHaveClass(/text-rose-400/)
  await expect(log.getByText('event 54')).toHaveClass(/text-amber-500/)

  await log.getByRole('button', { name: 'Clear history' }).click()
  await expect(log.getByText('No combat events yet')).toBeVisible()
})
