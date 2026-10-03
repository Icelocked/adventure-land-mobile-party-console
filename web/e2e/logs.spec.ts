import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

function logsServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  server.addCharacter({ name: 'Merchy', ctype: 'merchant', level: 40 })
  const now = Date.now()
  server.gameLogs = {
    Leada: [
      { session: 's', seq: 1, at: now - 5000, message: 'Leada killed a Goo', color: '' },
      { session: 's', seq: 2, at: now - 4000, message: 'Received 50 gold', color: '#ffd700' },
      { session: 's', seq: 3, at: now - 3000, message: 'Route rejected by the server', color: '' },
      { session: 's', seq: 4, at: now - 2000, message: 'Welcome back', color: '' },
    ],
    Ghost: [{ session: 's', seq: 1, at: now - 1000, message: 'Found a Ring', color: '' }],
  }
  server.combatLogs = { Leada: [{ at: now - 2500, message: 'Cleave hit 3 targets', type: 'skill' }] }
  server.merchantActivity = [{ at: now - 1500, message: 'Upgrade job failed', level: 'error' }]
  server.extraState = { anniversary: { slices: [], labels: {}, counts: {}, completeSets: 0, tradableNative: 0, missing: [], activity: [{ at: now - 500, message: 'Kissed Wizard' }] } }
  return server
}

test('Logs: game logs in order with category toggles (kills off by default) that persist, colours and errors', async ({ page }) => {
  const server = logsServer()
  await server.install(page)
  await page.goto('/logs')

  const list = page.getByLabel('Log entries')
  const lines = () => list.locator('p').allTextContents()
  await expect.poll(lines).toEqual([expect.stringMatching(/\[Leada\] Received 50 gold$/), expect.stringMatching(/\[Leada\] Route rejected by the server$/), expect.stringMatching(/\[Leada\] Welcome back$/), expect.stringMatching(/\[Ghost\] Found a Ring$/)])
  await expect(page.getByRole('button', { name: 'Kills' })).toHaveAttribute('aria-pressed', 'false')
  await expect(list.getByText('Received 50 gold')).toHaveCSS('color', 'rgb(255, 215, 0)')
  await expect(list.getByText('Route rejected by the server')).toHaveClass(/text-rose-300/)

  await page.getByRole('button', { name: 'Kills' }).click()
  await page.getByRole('button', { name: 'Info' }).click()
  await expect(list.getByText('Leada killed a Goo')).toBeVisible()
  await expect(list.getByText('Welcome back')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('party-log-filters') || '{}'))).toMatchObject({ kills: true, info: false })

  await page.reload()
  await expect(page.getByRole('button', { name: 'Kills' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Info' })).toHaveAttribute('aria-pressed', 'false')

  await page.getByLabel('Log character').selectOption('Ghost')
  await expect.poll(lines).toEqual([expect.stringMatching(/\[Ghost\] Found a Ring$/)])
  await expect(page.getByText('Character offline — showing retained logs')).toBeVisible()
})

test('Logs: dashboard logs combine combat, merchant and anniversary with a source filter; a failed refresh keeps retained logs', async ({ page }) => {
  const server = logsServer()
  await server.install(page)
  await page.goto('/logs')

  await page.getByRole('tab', { name: 'Dashboard logs' }).click()
  const list = page.getByLabel('Log entries')
  const lines = () => list.locator('p').allTextContents()
  await expect.poll(lines).toEqual([expect.stringMatching(/\[Leada\] Cleave hit 3 targets$/), expect.stringMatching(/\[Merchy\] Upgrade job failed$/), expect.stringMatching(/\[anniversary\] Kissed Wizard$/)])
  await expect(list.getByText('Upgrade job failed')).toHaveClass(/text-rose-300/)
  await expect(page.getByText('Live updates · latest 1,000 matching entries')).toBeVisible()

  await page.getByLabel('Dashboard log source').selectOption('anniversary')
  await expect.poll(lines).toEqual([expect.stringMatching(/\[anniversary\] Kissed Wizard$/)])

  server.failLogs = true
  await expect(page.getByText('Disconnected — showing retained logs')).toBeVisible()
  await expect(list.getByText('Kissed Wizard')).toBeVisible()
})
