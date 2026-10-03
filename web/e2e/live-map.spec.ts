import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

const definition = {
  name: 'main',
  min_x: -500,
  min_y: -500,
  max_x: 500,
  max_y: 500,
  default: null,
  tiles: [],
  placements: [],
  groups: [],
  tilesets: {},
}

function frame(x: number, y: number) {
  return {
    name: 'Rangy',
    map: 'main',
    at: Date.now(),
    x,
    y,
    entities: [{ id: 'Rangy', name: 'Rangy', type: 'character', x, y, hp: 80, max_hp: 100, mp: 50, max_mp: 100 }],
  }
}

test('Live map: collapsed position label, expands to a live canvas drawn from the stream, native-size view', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Rangy', ctype: 'ranger', level: 60, map: 'main', x: 10.4, y: -20.6 })
  server.mapDefinitions = { main: definition }
  server.setMapFrame('Rangy', frame(10, -21))
  await server.install(page)

  await page.goto('/characters/Rangy')
  await expect(page.getByText('main [10, -21]')).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)

  await page.getByRole('button', { name: 'Expand live map' }).click()
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible()
  await expect.poll(() => server.mapDefinitionRequests).toContainEqual(expect.stringMatching(/^maps\/main\?revision=/))
  await expect(page.getByText('reconnecting')).toHaveCount(0)
  await expect(page.getByText('loading', { exact: true })).toHaveCount(0)

  // The character (no sprite) is drawn as a teal block just above the canvas centre.
  await expect
    .poll(() =>
      canvas.evaluate((element: HTMLCanvasElement) => {
        const ctx = element.getContext('2d')!
        const { width, height } = element
        const data = ctx.getImageData(Math.floor(width / 2) - 8, Math.floor(height / 2) - 12, 16, 14).data
        for (let i = 0; i < data.length; i += 4) if (data[i] < 140 && data[i + 1] > 180 && data[i + 2] > 160) return true
        return false
      }),
    )
    .toBe(true)

  await page.getByRole('button', { name: 'Open native-size map' }).click()
  const large = page.getByRole('group', { name: 'Native-size map' })
  await expect(large.getByText('Rangy — main')).toBeVisible()
  await expect(large.locator('canvas')).toBeVisible()
  await large.getByRole('button', { name: 'Close native-size map' }).click()
  await page.getByRole('button', { name: 'Collapse live map' }).click()
  await expect(page.locator('canvas')).toHaveCount(0)
})

test('Live map: a Cave of Many Dreams zone is labelled and uses the stream definition, not /maps', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Rangy', ctype: 'ranger', level: 60, map: 'zone_ab12_3', x: 0, y: 0 })
  await server.install(page)

  await page.goto('/characters/Rangy')
  await expect(page.getByText('Cave of Many Dreams [0, 0]')).toBeVisible()
  await page.getByRole('button', { name: 'Expand live map' }).click()
  await expect(page.locator('canvas').first()).toBeVisible()
  await page.waitForTimeout(500)
  expect(server.mapDefinitionRequests).toEqual([])
})

test('Live map: the frame age shows when a character stops publishing (possible hang)', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Rangy', ctype: 'ranger', level: 60, map: 'main', x: 10, y: -21 })
  server.mapDefinitions = { main: definition }
  server.setMapFrame('Rangy', { ...frame(10, -21), at: Date.now() - 90_000 })
  await server.install(page)

  await page.goto('/characters/Rangy')
  await page.getByRole('button', { name: 'Expand live map' }).click()
  await expect(page.getByText(/^No frame for 1m 3\ds — may be hung$/)).toBeVisible()
  server.setMapFrame('Rangy', frame(10, -21))
  await expect(page.getByText(/^Live · last frame \ds ago$/)).toBeVisible()
  await page.getByRole('button', { name: 'Open native-size map' }).click()
  await expect(page.getByRole('group', { name: 'Native-size map' }).getByText(/^Live · last frame/)).toBeVisible()
})

test('Party list: each character shows how recently it reported, flagging a possible hang', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Fresh', ctype: 'ranger', level: 60 })
  server.addCharacter({ name: 'Stuck', ctype: 'priest', level: 60, diagnostics: { seenAt: Date.now() - 125_000 } })
  await server.install(page)
  await page.goto('/')
  await expect(page.getByRole('link', { name: /^Fresh/ }).getByText(/^Live · last update \ds ago$/)).toBeVisible()
  await expect(page.getByRole('link', { name: /^Stuck/ }).getByText(/^No update for 2m 0\ds — may be hung$/)).toBeVisible()
})

test('Farming-area picker: map preview with the legend, Enlarge map, and the unavailable fallback', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Ranger1', ctype: 'ranger', level: 50 })
  server.leader = 'Ranger1'
  server.bestiaryCatalog = [{ id: 'crabx', name: 'Crabxx', hp: 100, attack: 10, xp: 5, threat: 1, drops: [] }]
  server.monsterChoices = [{ id: 'crabx', locations: [{ map: 'main', x: 50, y: 75 }, { map: 'cave', x: 0, y: 0 }] }]
  server.monsterFocusByCharacter = { Ranger1: ['crabx'] }
  server.mapDefinitions = { main: definition }
  await server.install(page)

  await page.goto('/characters/Ranger1')
  await page.getByRole('button', { name: 'Find selected monster' }).click()
  await page.getByRole('button', { name: /main \(50, 75\)/ }).click()
  const preview = page.getByLabel('Farming area map').first()
  await expect(preview.locator('canvas')).toBeVisible()
  await expect(page.getByText('Cyan: spawn area · White: waypoint')).toBeVisible()
  await expect(page.getByText('Gold circle: hunt radius (400)')).toBeVisible()
  await expect.poll(() => server.mapDefinitionRequests).toContainEqual(expect.stringMatching(/^maps\/main\?revision=/))
  // The hunt radius circle is drawn in gold around the area.
  await expect
    .poll(() =>
      preview.locator('canvas').evaluate((element: HTMLCanvasElement) => {
        const data = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data
        for (let i = 0; i < data.length; i += 4) if (data[i] > 230 && data[i + 1] > 190 && data[i + 2] < 120) return true
        return false
      }),
    )
    .toBe(true)

  await page.getByRole('button', { name: 'Enlarge map' }).click()
  const large = page.getByRole('group', { name: 'main farming area' })
  await expect(large.locator('canvas')).toBeVisible()
  await large.getByRole('button', { name: 'Close enlarged map' }).click()

  await page.getByRole('button', { name: /cave \(0, 0\)/ }).click()
  await expect(page.getByText('Map preview unavailable. You can still choose this area.')).toBeVisible()
})
