import type { Page } from '@playwright/test'
import { MockPartyServer } from './mockPartyServer'

// Set 2 of OWNERS-PORT-MAP.md: the owners release's card, item, market and event fields and
// routes on top of the shared mock, so set 2 never edits mockPartyServer.ts. Each route is
// registered after the base ones; Playwright tries the newest route first, and route.fallback()
// hands a request this file does not answer to the base mock.

/** runtime/tasks/rules.ts HandControl. */
export type MockHandControl = { on: boolean; usePotions: boolean; combat: boolean; party: 'follows-me' | 'carries-on' }
const HAND_CONTROL_DEFAULT: MockHandControl = { on: false, usePotions: true, combat: true, party: 'follows-me' }

export class OwnersSet2Mock extends MockPartyServer {
  /** characterDetails[name].activity (runtime/status/api.ts CardLine); null sends no line. */
  activity: Record<string, Record<string, unknown> | null> = {}
  /** Config handControlByCharacter (settings/coordinator/routes/formation.ts). */
  handControlByCharacter: Record<string, MockHandControl> = {}
  /** Every formation body that carried `handControl`, in order. */
  handControlWrites: Record<string, unknown>[] = []
  /** Every POST /event-rejoin body, in order. */
  eventRejoins: Record<string, unknown>[] = []
  /** Core standSlots (items owner): unset leaves the field off core. */
  standSlots: { slots: number; used: number; free: number } | undefined

  /** The market feeds' ages: aldata.merchantsUpdatedAt and ponty.updatedAt (market section). */
  marketUpdatedAt: { aldata?: number; ponty?: number } = {}
  /** Each GET /market-watch the app opened (status streams.ts). */
  marketWatchOpens = 0

  stateSection(section: string, dashboard: boolean): Record<string, unknown> {
    const payload = super.stateSection(section, dashboard)
    if (section === 'market') {
      return {
        ...payload,
        aldata: { ...(payload.aldata as Record<string, unknown>), ...(this.marketUpdatedAt.aldata ? { merchantsUpdatedAt: this.marketUpdatedAt.aldata } : {}) },
        ponty: { ...(payload.ponty as Record<string, unknown>), ...(this.marketUpdatedAt.ponty ? { updatedAt: this.marketUpdatedAt.ponty } : {}) },
      }
    }
    if (section === 'config') return { ...payload, handControlByCharacter: this.handControlByCharacter }
    if (section !== 'core' || !dashboard) return payload
    const details = payload.characterDetails as Record<string, Record<string, unknown>>
    return {
      ...payload,
      characterDetails: Object.fromEntries(
        Object.entries(details).map(([name, detail]) => [name, name in this.activity ? { ...detail, activity: this.activity[name] } : detail]),
      ),
      ...(this.standSlots ? { standSlots: this.standSlots } : {}),
    }
  }

  async install(page: Page): Promise<void> {
    await super.install(page)
    // formation.ts settings(): the default, then the saved value, then the request's keys.
    await page.route('**/party-api/formation', async (route) => {
      const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>
      if (body.handControl === undefined) return route.fallback()
      const name = String(body.character ?? '')
      if (!this.characters.some((c) => c.name === name)) return route.fulfill({ status: 400, json: { error: 'invalid character' } })
      this.handControlWrites.push(body)
      const next = { ...HAND_CONTROL_DEFAULT, ...this.handControlByCharacter[name], ...(body.handControl as Partial<MockHandControl>) }
      this.handControlByCharacter = { ...this.handControlByCharacter, [name]: { on: next.on, usePotions: next.usePotions, combat: next.combat, party: next.party } }
      return route.fulfill({ json: { ok: true } })
    })
    // The watch stream sends nothing; `retry` keeps the browser from reopening it during a test.
    await page.route('**/party-api/market-watch', async (route) => {
      this.marketWatchOpens++
      return route.fulfill({ contentType: 'text/event-stream', body: 'retry: 600000\n\n' })
    })
    // events/coordinator/routes.ts rejoin: only an occurrence left by a manual move comes back.
    await page.route('**/party-api/event-rejoin', async (route) => {
      const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>
      const name = String(body.character ?? '')
      const event = String(body.event ?? '')
      this.eventRejoins.push(body)
      if (!this.characters.some((c) => c.name === name)) return route.fulfill({ status: 400, json: { error: 'event rejoin requires a party character' } })
      const entry = this.eventAttendance[name]?.[event]
      if (!entry || entry.ended || entry.ignored !== 'manual travel') return route.fulfill({ status: 409, json: { error: 'only an event left by a manual move can be rejoined' } })
      delete entry.ignored
      return route.fulfill({ json: { ok: true } })
    })
  }
}
