import { test, expect } from '@playwright/test'
import { OwnersSet2Mock } from './fixtures/ownersSet2Mock'

// OWNERS-PORT-MAP.md B15: the owners release's dungeon-panel.tsx offers "reopen shop" only for the
// points in the Cave view's `reopenable` list (hunting/coordinator/cave.ts snapshot).

function caveView(reopenable: string[]) {
  const cave = {
    run: 'ab12',
    floor: 1,
    expires: Date.now() + 9 * 60_000,
    remainingMs: 120_000,
    paused: false,
    gold: 100,
    amber: 3,
    points: [
      { id: 'p1', room: 'r1', label: 'Fountain', map: 'zone_ab12_1', x: 0, y: 0, required: true },
      { id: 'p6', room: '3:shop', label: 'Merchant', map: 'zone_ab12_1', x: 30, y: 0, done: true },
      { id: 'p7', room: '4:shop', label: 'Peddler', map: 'zone_ab12_1', x: 40, y: 0, done: true },
    ],
  }
  const observation = { protocol: 1, at: Date.now(), supported: true, alive: true, ready: true, members: [], cave, visit: { available: true, resets: 0, home: 'EU I', checkedAt: Date.now() } }
  return {
    state: { phase: 'active', participants: ['Leada'], protectFromEvents: true, commands: {}, run: 'ab12' },
    members: [{ name: 'Leada', fresh: true, observation }],
    entryRefusal: null,
    travelling: false,
    actionsReady: true,
    reopenable,
  }
}

test("B15: only the view's reopenable merchant rooms offer to reopen their shop", async ({ page }) => {
  const server = new OwnersSet2Mock()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  server.leader = 'Leada'
  server.dailyDungeon = caveView(['p6'])
  await server.install(page)

  await page.goto('/')
  const panel = page.getByRole('region', { name: 'Cave of Many Dreams controls' })
  await expect(panel.getByRole('button', { name: 'Merchant - reopen shop' })).toBeEnabled()
  // A done merchant room the coordinator leaves off the list reads as complete.
  await expect(panel.getByRole('button', { name: 'Peddler — complete' })).toBeDisabled()
})
