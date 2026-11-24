import { test, expect } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// Console 2db4d763 map-canvas.tsx with draw-map-sprites.ts and
// draw-map-projectile.ts. Field shapes follow runtime/map-sprites.ts and a
// live map-stream projectile read on 2026-10-22.

const square = (fill: string) =>
  'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="${fill}"/></svg>`)
const layer = (url: string, tint = 0xffffff) => ({ url, sx: 0, sy: 0, sw: 20, sh: 20, dx: -10, dy: -20, transform: [1, 0, 0, 1, 0, 0], alpha: 1, tint })

const definition = { name: 'main', min_x: -500, min_y: -500, max_x: 500, max_y: 500, default: null, tiles: [], placements: [], groups: [], tilesets: {} }

function frame() {
  const now = Date.now()
  return {
    name: 'Rangy',
    map: 'main',
    at: now,
    projectilesAt: now,
    x: 0,
    y: 0,
    entities: [{ id: 'Rangy', name: 'Rangy', type: 'character', x: 0, y: 0, hp: 80, max_hp: 100, mp: 50, max_mp: 100, layers: [layer(square('#ff0000'))] }],
    projectiles: [
      { ray: false, id: 'p1', url: square('#00ff00'), frames: 1, frameMillis: 9, scale: 1, directional: false, startedAt: now - 60_000, expiresAt: now + 60_000, x: 40, y: 20, targetX: 40, targetY: 20 },
    ],
    // A white cell tinted 0x0000ff draws blue.
    visuals: [{ id: 'v1', x: -40, y: 20, layers: [layer(square('#ffffff'), 0x0000ff)] }],
  }
}

test('Live map: native sprite layers replace the fallback block, and projectiles and tinted visuals draw', async ({ page }) => {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Rangy', ctype: 'ranger', level: 60, map: 'main', x: 0, y: 0 })
  server.mapDefinitions = { main: definition }
  server.setMapFrame('Rangy', frame())
  await server.install(page)

  await page.goto('/characters/Rangy')
  await page.getByRole('button', { name: 'Expand live map' }).click()
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible()

  const colours = () => {
    // Projectiles and visuals draw only within 1s of a frame, as the stream sends them.
    server.setMapFrame('Rangy', frame())
    return canvas.evaluate((element: HTMLCanvasElement) => {
      const data = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data
      const seen = { red: false, green: false, blue: false, teal: false }
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
        if (r > 200 && g < 60 && b < 60) seen.red = true
        if (g > 200 && r < 60 && b < 60) seen.green = true
        if (b > 200 && r < 60 && g < 60) seen.blue = true
        // The no-sprite fallback block, #5eead4.
        if (r < 140 && g > 180 && b > 160) seen.teal = true
      }
      return seen
    })
  }
  await expect.poll(colours, { timeout: 10_000 }).toEqual({ red: true, green: true, blue: true, teal: false })
})
