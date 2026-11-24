import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// OWNERS-PORT-MAP.md B5: the party header's Diagnostics button and the Diagnostics screen
// (diagnostics-dialog.tsx) over /diagnostics/alerts, /diagnostics/alert and /diagnostics/records.

function partyWithAlerts() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 70 })
  server.addCharacter({ name: 'Healy', ctype: 'priest', level: 70 })
  server.diagnosticsAlerts = [
    { id: 'Leada-death-1', subject: 'Leada', trigger: 'death', at: Date.UTC(2026, 10, 24, 10) },
    { id: 'party-churn-2', subject: 'party', trigger: 'churn', at: Date.UTC(2026, 10, 24, 11) },
  ]
  return server
}

test('the badge counts unread alerts; opening marks nothing, Mark as read and Mark all as read do', async ({ page }) => {
  const server = partyWithAlerts()
  // The console page's own marks and v1.5.0's read time are not the PWA's marks.
  await page.addInitScript(() => {
    localStorage.setItem('party-ui:diagnostics-read-alerts', JSON.stringify(['Leada-death-1', 'party-churn-2']))
    localStorage.setItem('party-ui:diagnostics-read', '1732400000000')
  })
  await server.install(page)
  await page.goto('/')
  const button = page.getByRole('link', { name: 'Diagnostics, 2 unread' })
  await expect(button).toBeVisible()
  await button.click()
  await expect(page).toHaveURL(/\/diagnostics$/)
  await expect(page.getByText('2 unread of 2')).toBeVisible()
  await expect(page.locator('[data-area="diagnostics-alert"][data-unread]')).toHaveCount(2)

  const death = page.getByRole('article', { name: 'Leada-death-1' })
  await expect(death).toContainText('Death')
  await expect(death).toContainText('Leada')
  await death.getByRole('button', { name: 'Mark as read' }).click()
  await expect(page.getByText('1 unread of 2')).toBeVisible()
  await expect(death.getByRole('button', { name: 'Mark as read' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('link', { name: 'Diagnostics, 1 unread' })).toBeVisible()
  await page.goto('/diagnostics')
  await page.getByRole('button', { name: 'Mark all as read' }).click()
  await expect(page.getByText('0 unread of 2')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark all as read' })).toBeDisabled()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('party-console-companion:diagnostics-read-alerts') ?? '[]'))).toEqual(['Leada-death-1', 'party-churn-2'])
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Diagnostics', exact: true })).toBeVisible()
})

test('a new saved record reloads the alerts', async ({ page }) => {
  const server = partyWithAlerts()
  server.diagnosticsAlerts = []
  await server.install(page)
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Diagnostics', exact: true })).toBeVisible()
  server.diagnosticsAlerts = [{ id: 'Healy-stuck-3', subject: 'Healy', trigger: 'stuck', at: Date.now() }]
  server.recordSaved = { at: Date.now(), ring: 'movement', character: 'Healy', record: 'Healy-stuck-3' }
  await expect(page.getByRole('link', { name: 'Diagnostics, 1 unread' })).toBeVisible({ timeout: 10_000 })
})

test("an alert's report shows its facts and lead-up; a failed read says so", async ({ page }) => {
  const server = partyWithAlerts()
  server.diagnosticsReports['Leada-death-1'] = {
    id: 'Leada-death-1', character: 'Leada', trigger: 'death', at: 1,
    incidents: [{
      id: 'inc-1', kind: 'death', activity: 'Farming bees', rung: 'walk', trying: 'smart move', noProgressMs: 12_400,
      position: { map: 'main', x: 10.4, y: -20.6 }, blocked: { code: 'occupied', by: { kind: 'task', owner: 'merchant' } }, error: 'killed by bee',
      leadUp: [{ seq: 4, decision: 'attack', kind: 'bee', owner: '04', code: 'in-range' }],
    }],
    records: [{ seq: 3, decision: 'move', part: 'route', by: { kind: 'owner', site: 'walk.ts' } }],
  }
  server.diagnosticsReports['party-churn-2'] = null
  await server.install(page)
  await page.goto('/diagnostics')
  const death = page.getByRole('article', { name: 'Leada-death-1' })
  await death.getByText('Report').click()
  await expect.poll(() => server.diagnosticsReads).toContain('alert?subject=Leada&id=Leada-death-1')
  await expect(death).toContainText('Farming bees')
  await expect(death).toContainText('walk - smart move')
  await expect(death).toContainText('12 s without progress')
  await expect(death).toContainText('main [10, -21]')
  await expect(death).toContainText('occupied from task merchant')
  await expect(death).toContainText('killed by bee')
  await expect(death.getByRole('table', { name: 'Lead-up (1 records)' })).toContainText('in-range')
  await expect(death.getByRole('table', { name: 'Records before it (1)' })).toContainText('route move')
  await expect(death.getByRole('table', { name: 'Records before it (1)' })).toContainText('owner walk.ts')

  const churn = page.getByRole('article', { name: 'party-churn-2' })
  await churn.getByText('Report').click()
  await expect(churn.getByRole('alert')).toHaveText('The report could not be read (record store unavailable).')

  // An alert's own address shows only it, with its report open.
  await death.getByRole('link', { name: 'Leada-death-1' }).click()
  await expect(page).toHaveURL(/\/diagnostics\/record\/Leada-death-1$/)
  await expect(page.locator('[data-area="diagnostics-alert"]')).toHaveCount(1)
  await expect(page.getByRole('article', { name: 'Leada-death-1' })).toContainText('Farming bees')
  await page.getByRole('link', { name: 'All records' }).click()
  await expect(page.locator('[data-area="diagnostics-alert"]')).toHaveCount(2)
})

test('Show all records reads each character\'s ring through the lease, per ring tab', async ({ page }) => {
  const server = partyWithAlerts()
  server.diagnosticsRecords.Leada = {
    movement: { at: Date.now(), records: [{ seq: 1, decision: 'walk', owner: '02' }], incidents: [] },
    turns: { at: Date.now(), records: [], incidents: [{ kind: 'read-failed', error: 'ring missing' }] },
  }
  server.diagnosticsRecords.Healy = null
  await server.install(page)
  await page.goto('/diagnostics')
  await expect(page.getByText('Show all records')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Show all records' })).not.toBeChecked()
  await page.getByRole('checkbox', { name: 'Show all records' }).check()
  const rings = page.locator('[data-area="diagnostics-rings"]')
  await expect(rings.getByRole('article', { name: 'Leada' }).getByRole('table', { name: 'Movement records (1)' })).toContainText('walk')
  await expect(rings.getByRole('alert')).toHaveText('Healy: the movement records could not be read (lease store unavailable).')
  await expect.poll(() => server.diagnosticsReads).toContain('records?character=Leada&rings=movement')
  // One read per report period renews the lease while the tab shows.
  await expect.poll(() => server.diagnosticsReads.filter((read) => read === 'records?character=Leada&rings=movement').length).toBeGreaterThan(2)

  await rings.getByRole('tab', { name: 'Turns' }).click()
  await expect(page).toHaveURL(/\/diagnostics\/turns$/)
  await expect(rings.getByRole('tab', { name: 'Turns' })).toHaveAttribute('aria-selected', 'true')
  await expect(rings.getByText('Leada: the character could not read its turns ring (ring missing).')).toBeVisible()
  await expect.poll(() => server.diagnosticsReads).toContain('records?character=Healy&rings=turns')
})
