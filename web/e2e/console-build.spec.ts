import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// Ryan's managed console builds: dashboard/features/party/console-build-control.tsx
// over tools/console-build/routes.ts (GET /console-build, POST
// /console-build/deploy {buildId, mode}) and contracts.ts ConsoleBuildStatus.

const build = (id: string, createdAt: string, dashboard: string) => ({
  schema: 1,
  id,
  createdAt,
  sourceHash: `source-${id}`,
  commit: `commit-${id}`,
  components: { dashboard, coordinator: `coordinator-${id}`, characters: 'characters-same' },
})

function server(fields: Record<string, unknown> = {}) {
  const mock = new MockPartyServer()
  mock.paired = true
  mock.addCharacter({ name: 'Patinder', ctype: 'merchant', level: 58 })
  mock.consoleBuild = {
    active: 'old',
    available: 'new',
    pendingBuildCount: 2,
    builds: [build('old', '2026-10-22T01:00:00Z', 'dash-old'), build('mid', '2026-10-22T02:00:00Z', 'dash-mid'), build('new', '2026-10-22T03:00:00Z', 'dash-new')],
    ...fields,
  }
  return mock
}

function deploys(page: Page) {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/console-build/deploy') bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

test('no button without a newer completed build, or on a console without managed builds', async ({ page }) => {
  const mock = server({ available: 'old' })
  await mock.install(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Party' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Deploy new console build' })).toHaveCount(0)
  mock.consoleBuild = null
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Party' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Deploy new console build' })).toHaveCount(0)
})

test('Load now confirms the build id, source hash and revision, then posts mode now', async ({ page }) => {
  const mock = server()
  await mock.install(page)
  const bodies = deploys(page)
  await page.goto('/')
  const button = page.getByRole('button', { name: 'Deploy new console build' })
  await expect(button).toContainText('2')
  await button.click()
  const menu = page.getByRole('dialog', { name: 'Load console build' })
  await menu.getByRole('button', { name: 'Load now' }).click()
  const confirm = page.getByRole('dialog', { name: 'Load console build now?' })
  await expect(confirm.getByText('Build: new')).toBeVisible()
  await expect(confirm.getByText('Source: source-new')).toBeVisible()
  await expect(confirm.getByText('Revision: commit-new')).toBeVisible()
  await expect(confirm.getByText('Changed components: dashboard, coordinator')).toBeVisible()
  await confirm.getByRole('button', { name: 'Load now' }).click()
  await expect.poll(() => bodies).toEqual([{ buildId: 'new', mode: 'now' }])
  await expect(confirm).toHaveCount(0)
  // The coordinator's journal drives the progress line until the build is active.
  await button.click()
  await expect(page.getByRole('dialog', { name: 'Load console build' }).getByText(/^activating · /)).toBeVisible()
})

test('Load when safe and Load at Main post their modes, and Cave disables both', async ({ page }) => {
  const mock = server()
  await mock.install(page)
  const bodies = deploys(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Deploy new console build' }).click()
  await page.getByRole('dialog', { name: 'Load console build' }).getByRole('button', { name: 'Load when safe' }).click()
  await expect.poll(() => bodies).toEqual([{ buildId: 'new', mode: 'safe' }])

  const cave = server({ cave: true })
  await cave.install(page)
  await page.reload()
  await page.getByRole('button', { name: 'Deploy new console build' }).click()
  const menu = page.getByRole('dialog', { name: 'Load console build' })
  await expect(menu.getByRole('button', { name: 'Load when safe' })).toBeDisabled()
  await expect(menu.getByRole('button', { name: 'Load at Main' })).toBeDisabled()
  await expect(menu.getByRole('button', { name: 'Load now' })).toBeEnabled()
})

test('a deployment conflict shows the running operation instead of failing silently', async ({ page }) => {
  const mock = server()
  mock.consoleBuildConflict = { id: 'op-1', target: 'mid', startedAt: '2026-10-22T03:05:00Z', phase: 'waiting-safe', waiting: ['Patinder'] }
  await mock.install(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Deploy new console build' }).click()
  await page.getByRole('dialog', { name: 'Load console build' }).getByRole('button', { name: 'Load at Main' }).click()
  await page.getByRole('button', { name: 'Deploy new console build' }).click()
  const menu = page.getByRole('dialog', { name: 'Load console build' })
  await expect(menu.getByText(/^waiting safe · /)).toBeVisible()
  await expect(menu.getByText('Waiting: Patinder')).toBeVisible()
})
