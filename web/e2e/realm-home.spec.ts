import { test, expect, type Page } from '@playwright/test'
import { MockPartyServer } from './fixtures/mockPartyServer'

// Console 1.4 realm panel: home-change wording and confirmation, and mixed homes.

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
