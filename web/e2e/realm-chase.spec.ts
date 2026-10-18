import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// Console 1.4 realm panel: home-change wording and confirmation, mixed homes,
// boss chase and the realm hop blacklist.

function postBodies(page: Page, path: string): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith(`/party-api/${path}`)) bodies.push(request.postDataJSON() as Record<string, unknown>)
  })
  return bodies
}

function realmServer() {
  const server = new MockPartyServer()
  server.paired = true
  server.addCharacter({ name: 'Leada', ctype: 'warrior', level: 60 })
  server.addCharacter({ name: 'Merchy', ctype: 'merchant', level: 40 })
  server.realmControl = {
    activeRealm: 'SR_USI',
    currentRealm: 'SR_USI',
    homeRealm: 'SR_USI',
    homeCharacters: [
      { name: 'Leada', home: 'SR_USI' },
      { name: 'Merchy', home: 'SR_USI' },
    ],
    split: false,
    characters: [],
    realms: [
      { key: 'SR_USI', label: 'US I', players: 80, pvp: false },
      { key: 'SR_EUII', label: 'EU II', players: 40, pvp: false },
      { key: 'SR_USPVP', label: 'US PVP', players: 9, pvp: true },
    ],
  }
  return server
}

const time = /\d{1,2}:\d{2}( [AP]M)?/

test('Realm home: mixed homes warn per character, and the current realm can become home with the 1.4 wording', async ({ page }) => {
  const server = realmServer()
  server.realmControl = {
    ...server.realmControl,
    homeRealm: null,
    homeCharacters: [
      { name: 'Leada', home: 'SR_USI' },
      { name: 'Merchy', home: null },
    ],
  }
  await server.install(page)
  const bodies = postBodies(page, 'realm/switch')

  await page.goto('/settings')
  await expect(page.getByText('Current: US I · Home: Unknown')).toBeVisible()
  await expect(page.getByText('Home realms differ or are unconfirmed:')).toBeVisible()
  await expect(page.getByText('Leada: SR_USI')).toBeVisible()
  await expect(page.getByText('Merchy: unconfirmed')).toBeVisible()

  await page.getByText('Change realm…').click()
  // The party is already on US I, but it is not everyone's home yet.
  await page.getByRole('button', { name: 'US I (80 players)' }).click()
  await expect(page.getByText(/one non-merchant will visit Bean/)).toHaveCount(0)
  await page.getByRole('group', { name: 'Switch realm?' }).getByRole('checkbox').check()
  const confirm = page.getByRole('group', { name: 'Change home realm?' })
  await expect(confirm.getByText('This will change for all characters in the account including characters not currently logged in.')).toBeVisible()
  await expect(confirm.getByText(/Adventure Land enforces a 36-hour home-change cooldown per character\./)).toBeVisible()
  await confirm.getByRole('button', { name: 'Change home realm' }).click()
  await expect.poll(() => bodies[0]).toEqual({ realm: 'SR_USI', setHome: true })
})

test('Realm home: the current realm that is already home cannot be picked; a home change shows each confirmation', async ({ page }) => {
  const server = realmServer()
  server.realmControl = {
    ...server.realmControl,
    operation: {
      id: 'op-1',
      phase: 'setting-home',
      realm: 'SR_EUII',
      setHome: true,
      startedAt: Date.now(),
      characters: [
        { name: 'Leada', ctype: 'warrior', realm: 'SR_EUII', online: true, homeConfirmed: true },
        { name: 'Merchy', ctype: 'merchant', realm: 'SR_EUII', online: true },
      ],
    },
  }
  await server.install(page)

  await page.goto('/settings')
  await expect(page.getByText('Home realms differ or are unconfirmed:')).toHaveCount(0)
  await expect(page.getByText('setting home')).toBeVisible()
  await expect(page.getByText('Leada: SR_EUII — home confirmed')).toBeVisible()
  await expect(page.getByText('Merchy: SR_EUII — waiting for home confirmation')).toBeVisible()

  server.realmControl = { ...server.realmControl, operation: null }
  await page.reload()
  await page.getByText('Change realm…').click()
  await expect(page.getByRole('button', { name: 'US I (80 players)' })).toBeDisabled()
})

test('Boss chase: toggle and minimum ETA bodies, trip/sightings/respawns, and errors', async ({ page }) => {
  const server = realmServer()
  const respawnAt = Date.now() + 40 * 60_000
  server.bossChase = {
    ...server.bossChase,
    enabled: true,
    minEtaMinutes: 20,
    checkedAt: Date.now(),
    trip: { boss: 'franky', realm: 'SR_EUII', returnRealm: 'SR_USI', bossId: 'b1', startedAt: Date.now(), arrived: true, missingPolls: 0 },
    sightings: [
      { boss: 'icegolem', realm: 'SR_EUII', hp: 12_345_678, etaMinutes: 33.4, target: 'Leada' },
      { boss: 'crabxx', realm: 'SR_USI', hp: 900_000, etaMinutes: null, target: null },
    ],
    respawns: [{ boss: 'mrpumpkin', realm: 'SR_USI', respawnAt }],
    lastError: 'ALData unreachable',
  }
  await server.install(page)
  const bodies = postBodies(page, 'realm/boss-chase')

  await page.goto('/settings')
  const chase = page.getByRole('group', { name: 'Event boss realm chase' })
  await expect(chase.getByText('Franky · fighting on EU II · returns to US I')).toBeVisible()
  await expect(chase.getByText('Ice Golem · EU II · Leada')).toBeVisible()
  await expect(chase.getByText('12.3M HP · ~33 min')).toBeVisible()
  await expect(chase.getByText('Giga Crab · US I')).toBeVisible()
  await expect(chase.getByText('0.9M HP · estimating…')).toBeVisible()
  await expect(chase.getByText('Mr. Pumpkin · US I')).toBeVisible()
  await expect(chase.getByText(new RegExp(`^respawns ${time.source}$`))).toBeVisible()
  await expect(chase.getByRole('alert')).toHaveText('ALData unreachable')

  const minEta = chase.getByLabel('Only hop if at least this many minutes remain')
  await expect(minEta).toHaveValue('20')
  await expect(chase.getByRole('button', { name: 'Save' })).toBeDisabled()
  await minEta.fill('30')
  await chase.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => bodies[0]).toEqual({ minEtaMinutes: 30 })
  await expect(minEta).toHaveValue('30')

  await minEta.fill('700')
  await chase.getByRole('button', { name: 'Save' }).click()
  await expect(chase.getByText('minEtaMinutes must be between 0 and 600')).toBeVisible()

  const toggle = chase.getByRole('button', { name: 'Chase event bosses across realms' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.click()
  await expect.poll(() => bodies[2]).toEqual({ enabled: false })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(toggle).toHaveText('Off')
  // Disabling ends the trip, and the sightings list only shows while enabled.
  await expect(chase.getByText(/fighting on/)).toHaveCount(0)
  await expect(chase.getByText('Ice Golem · EU II · Leada')).toHaveCount(0)
})

test('Boss chase: enabling with no data waits for the first check', async ({ page }) => {
  const server = realmServer()
  await server.install(page)
  const bodies = postBodies(page, 'realm/boss-chase')

  await page.goto('/settings')
  const chase = page.getByRole('group', { name: 'Event boss realm chase' })
  await expect(chase.getByLabel('Only hop if at least this many minutes remain')).toHaveValue('15')
  await chase.getByRole('button', { name: 'Chase event bosses across realms' }).click()
  await expect.poll(() => bodies[0]).toEqual({ enabled: true })
  await expect(chase.getByText('Waiting for the first check…')).toBeVisible()
})

test('Daily chase: the scheduled event prediction setting is gone; the blacklist names only boss chase', async ({ page }) => {
  const server = realmServer()
  await server.install(page)
  const posted: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST') posted.push(new URL(request.url()).pathname)
  })

  await page.goto('/settings')
  // Console 6fa7b0f dropped /realm/daily-chase and the dailyChase state field.
  await expect(page.getByRole('group', { name: 'Event boss realm chase' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Scheduled event realm prediction' })).toHaveCount(0)
  await expect(page.getByText('Predict scheduled events across realms')).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Realm hopping blacklist' })).toContainText('Boss chase skips checked realms')
  expect(posted.filter((path) => path.includes('daily-chase'))).toEqual([])
})

test('Realm hop blacklist: sends the whole list on each toggle; PVP is always skipped', async ({ page }) => {
  const server = realmServer()
  await server.install(page)
  const bodies = postBodies(page, 'realm/hop-blacklist')

  await page.goto('/settings')
  const list = page.getByRole('group', { name: 'Realm hopping blacklist' })
  const pvp = list.getByRole('checkbox', { name: 'Never hop to US PVP' })
  await expect(pvp).toBeChecked()
  await expect(pvp).toBeDisabled()
  await expect(list.getByText('PVP · always skipped')).toBeVisible()
  await expect(list.getByText('80 players')).toBeVisible()

  await list.getByRole('checkbox', { name: 'Never hop to US I' }).click()
  await expect.poll(() => bodies[0]).toEqual({ realms: ['SR_USI'] })
  await expect(list.getByRole('checkbox', { name: 'Never hop to US I' })).toBeChecked()
  await list.getByRole('checkbox', { name: 'Never hop to EU II' }).click()
  await expect.poll(() => bodies[1]).toEqual({ realms: ['SR_USI', 'SR_EUII'] })
  await expect(list.getByRole('checkbox', { name: 'Never hop to EU II' })).toBeChecked()
  await list.getByRole('checkbox', { name: 'Never hop to US I' }).click()
  await expect.poll(() => bodies[2]).toEqual({ realms: ['SR_EUII'] })
  await expect(list.getByRole('checkbox', { name: 'Never hop to US I' })).not.toBeChecked()

  server.failOnce['realm/hop-blacklist'] = 'unknown Adventure Land realm: SR_USI'
  await list.getByRole('checkbox', { name: 'Never hop to US I' }).click()
  await expect(list.getByRole('alert')).toHaveText('unknown Adventure Land realm: SR_USI')
  await expect(list.getByRole('checkbox', { name: 'Never hop to US I' })).not.toBeChecked()
})

test('Realm chase settings: an empty realm list waits for it', async ({ page }) => {
  const server = realmServer()
  server.realmControl = null
  await server.install(page)
  await page.goto('/settings')
  await expect(page.getByRole('group', { name: 'Realm hopping blacklist' }).getByText('Waiting for the realm list…')).toBeVisible()
})
