import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// Shapes follow runtime/metrics/contracts.ts, checked against the live
// console's GET /party-api/metrics, /metrics/kills, /metrics/bars and
// /metrics/account-gold on 2026-10-22.
function metricsServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  server.addCharacter({ name: 'Healy', ctype: 'priest', level: 58 })
  server.bestiaryCatalog = [{ id: 'goo', name: 'Goo' }, { id: 'bee', name: 'Bee' }]
  server.skillCatalog = [{ id: 'warrior', name: 'Warrior', skills: [{ id: 'cleave', name: 'Cleave' }] }]
  server.extraState = {
    accountId: 'acct-e2e',
    accountGold: { carried: 34_567, total: 1_234_567 },
    merchantCatalog: { allItems: [{ id: 'seashell', name: 'Seashell', meta: { world: { drops: [{ monsterId: 'goo', monsterName: 'Goo', rate: 0.01, quantity: 1, sourceType: 'monster', acquisitionPath: ['goo'] }] } } }] },
  }
  const now = Date.now(), bucket = Math.floor(now / 10_000) * 10_000
  const sample = (at: number, gold: number) => ({ at, gold, luck: 1, ping: 40, level: 60, xp: 0, maxXp: 1, goldMovement: 0 })
  const totals = (character: string, server: string, at: number) => ({
    character, server, observedMs: 10_000, partial: false, damage: [{ monster: 'goo', skill: 'cleave', amount: 500, hits: 5 }],
    credits: [{ monster: 'goo', count: 2 }], loot: [], first: sample(at, 1_000), last: sample(at + 5_000, 1_100),
    samples: 2, luckSum: 2, pingSum: 80, pingSamples: 2,
  })
  server.metrics = {
    range: {
      version: 1, startedAt: now - 7_200_000, resolutionMs: 10_000, characters: ['Healy', 'Leada'], servers: ['EUI', 'USII'],
      points: [{ at: bucket - 10_000, values: [totals('Leada', 'EUI', bucket - 10_000), totals('Healy', 'EUI', bucket - 10_000)], kills: [{ server: 'EUI', monster: 'goo', actor: 'Leada', count: 2 }] }],
      lastReceivedAt: now, incomplete: false, resets: {},
    },
    gold: {
      startedAt: now - 7_200_000, resolutionMs: 10_000, characters: ['Healy', 'Leada'], resets: {},
      points: [
        { at: bucket - 20_000, values: [{ character: 'Leada', server: 'EUI', first: sample(bucket - 20_000, 1_000), last: sample(bucket - 15_000, 1_100) }] },
        { at: bucket - 10_000, values: [{ character: 'Leada', server: 'EUI', first: sample(bucket - 10_000, 1_100), last: sample(bucket - 5_000, 1_400) }] },
      ],
    },
    kills: {
      version: 1, elapsedMs: 3_600_000, dayFrom: 0, dayTo: 0, resetAt: 0, lastReceivedAt: now,
      monsters: [{ monster: 'goo', count: 12, total: 40, today: 7 }, { monster: 'bee', count: 3, total: 3, today: 1 }],
    },
    damage: {
      version: 1, metric: 'damage', by: 'character', elapsedMs: 3_600_000, dayFrom: 0, dayTo: 0, resetAt: 0, lastReceivedAt: now,
      rows: [{ id: 'Leada', amount: 36_000, total: 90_000, today: 50_000 }], characters: ['Leada'], monsters: ['goo'], skills: ['cleave'], items: [],
    },
    loot: {
      version: 1, metric: 'loot', by: 'item', elapsedMs: 3_600_000, dayFrom: 0, dayTo: 0, resetAt: 0, lastReceivedAt: now,
      rows: [{ id: 'seashell', amount: 6, total: 20, today: 4 }], characters: ['Leada'], monsters: [], skills: [], items: ['seashell'],
    },
    accountGold: { from: now - 60_000, to: now, points: [{ at: bucket - 20_000, total: 1_000_000 }, { at: bucket - 10_000, total: 1_200_000 }] },
  }
  return server
}

const lastRequest = (server: MockPartyServer, path: string) => {
  const match = server.metricsRequests.filter((request) => request.startsWith(path + '?')).at(-1)
  return match ? new URLSearchParams(match.slice(match.indexOf('?') + 1)) : null
}

async function openMetrics(page: Page, server: MockPartyServer) {
  await server.install(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Menu' }).first().click()
  await page.getByRole('button', { name: 'Metrics' }).click()
  await expect(page).toHaveURL(/\/metrics$/)
  return page.getByRole('region', { name: 'Game metrics' })
}

test('Metrics: kills, DPS, loot and gold charts read the console metrics routes', async ({ page }) => {
  const server = metricsServer()
  const view = await openMetrics(page, server)

  const kills = view.getByRole('region', { name: 'Kills', exact: true })
  await expect(kills.getByLabel('Total kills today')).toHaveText(/8/)
  await expect(kills.getByText('Goo', { exact: true })).toBeVisible()
  await expect(kills.getByText('Total 40')).toBeVisible()
  await expect(kills.getByText('12/h')).toBeVisible()
  const killsQuery = lastRequest(server, 'metrics/kills')!
  expect(Number(killsQuery.get('to')) - Number(killsQuery.get('from'))).toBe(3_600_000)
  expect(Number(killsQuery.get('dayTo')) - Number(killsQuery.get('dayFrom'))).toBeGreaterThanOrEqual(23 * 3_600_000)

  // Tapping a bar shows its value in place of a hover tooltip.
  await kills.getByRole('button', { name: 'Goo' }).click()
  await expect(kills.getByRole('status')).toHaveText('Goo: 12')

  const dps = view.getByRole('region', { name: 'DPS' })
  await expect(dps.getByText('10/s')).toBeVisible()
  await expect(dps.getByLabel('Total damage today')).toHaveText(/50K/)
  expect(lastRequest(server, 'metrics/bars')).not.toBeNull()
  expect(server.metricsRequests.some((request) => request.startsWith('metrics/bars?metric=damage&by=character&'))).toBe(true)

  await expect(view.getByRole('region', { name: 'Items acquired' }).getByText('Seashell')).toBeVisible()
  await expect(view.getByRole('region', { name: 'Loot breakdown' }).getByLabel('Current Loot breakdown')).toHaveText(/6/)
  await expect(view.getByRole('region', { name: 'Gold history' }).getByLabel('Net gold gained since reset')).toHaveText(/400/)
  await expect(view.getByRole('region', { name: 'Total account gold' }).getByLabel('Current Total account gold')).toHaveText(/1,234,567/)
  expect(server.metricsRequests.some((request) => request.startsWith('metrics?sinceReset=gold&resetAt=0&to='))).toBe(true)
  expect(server.metricsRequests.some((request) => request.startsWith('metrics/account-gold?resetAt=0&to='))).toBe(true)
  await expect(view.getByRole('region', { name: 'Ping history' })).toBeVisible()
})

test('Metrics: character and server filters reach every metrics query', async ({ page }) => {
  const server = metricsServer()
  const view = await openMetrics(page, server)
  await expect(view.getByRole('region', { name: 'Kills', exact: true }).getByText('Goo', { exact: true })).toBeVisible()

  await view.getByRole('button', { name: 'Filter characters' }).click()
  await page.getByRole('checkbox', { name: 'Leada' }).check()
  await page.keyboard.press('Escape')
  await view.getByLabel('Server').selectOption('USII')
  await expect.poll(() => lastRequest(server, 'metrics/kills')?.get('characters')).toBe('Leada')
  await expect.poll(() => lastRequest(server, 'metrics/kills')?.get('servers')).toBe('USII')
  await expect.poll(() => lastRequest(server, 'metrics/bars')?.get('characters')).toBe('Leada')

  await view.getByLabel('Time range').selectOption('86400000')
  await expect.poll(() => { const query = lastRequest(server, 'metrics/kills'); return query ? Number(query.get('to')) - Number(query.get('from')) : 0 }).toBe(86_400_000)
})

test('Metrics: the drop estimator projects kills for a chosen item', async ({ page }) => {
  const server = metricsServer()
  const view = await openMetrics(page, server)
  const estimate = view.getByRole('region', { name: 'Item drop estimate' })
  await expect(estimate.getByText('Choose an item')).toBeVisible()
  await estimate.getByRole('button', { name: 'Choose drop item' }).click()
  await page.getByLabel('Search drop items').fill('sea')
  await page.getByRole('button', { name: /Seashell/ }).click()
  // 1% base rate at luck 1: mean 100 kills, 50% at 69, 90% at 230.
  await expect(estimate.getByLabel('Mean')).toHaveText('100 kills')
  await expect(estimate.getByLabel('50%')).toHaveText('69 kills')
  await expect(estimate.getByLabel('90%')).toHaveText('230 kills')
})

test('Metrics: Reset data asks first, then posts the performance reset', async ({ page }) => {
  const server = metricsServer()
  const view = await openMetrics(page, server)
  await view.getByRole('button', { name: 'Reset data' }).click()
  expect(server.metricsResets).toEqual([])
  await view.getByRole('button', { name: 'Confirm reset' }).click()
  await expect.poll(() => server.metricsResets).toEqual([{ metric: 'performance' }])
})

test('Metrics: a 503 from metrics storage shows the view as unavailable', async ({ page }) => {
  const server = metricsServer()
  server.metrics = { range: null, gold: null, kills: null, damage: null, loot: null, accountGold: null }
  const view = await openMetrics(page, server)
  await expect(view.getByRole('status').filter({ hasText: 'Metrics unavailable' })).toBeVisible()
})
