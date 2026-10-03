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
