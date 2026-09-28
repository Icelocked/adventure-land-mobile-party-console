import type { Page } from '@playwright/test'

/**
 * A stateful in-memory stand-in for party-console's own HTTP surface,
 * installed via Playwright route interception - no live server is ever
 * involved. This keeps e2e tests fast, deterministic, and completely
 * incapable of mutating a real account (there's no way to "accidentally"
 * mark a real character's real items while testing against this).
 *
 * Deliberately loose typing (Record<string, unknown> throughout) - this
 * mirrors the wire shapes in web/src/models exactly enough for the app to
 * render and act on, without importing/duplicating those interfaces here.
 */

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAF0lEQVR42mNk+P+/noEIwDiqkL4KAV+BEjOd0YoAAAAASUVORK5CYII='

export interface MockItem {
  name: string
  level?: number
  q?: number
  stat_type?: string
}

export interface MockCharacter {
  name: string
  ctype: string
  level: number
  hp?: number
  max_hp?: number
  mp?: number
  max_mp?: number
  gold?: number
  map?: string
  x?: number
  y?: number
  items?: (MockItem | null)[]
}

export interface MockCatalogEntry {
  id: string
  name: string
  upgradeable?: boolean
  compoundable?: boolean
}

const testSprite = () => ({ url: '/e2e-sprite.png', tileSize: 8, columns: 1, rows: 1, x: 0, y: 0 })

export class MockPartyServer {
  characters: MockCharacter[] = []
  catalogEntries: Record<string, MockCatalogEntry> = {}
  craftable: Record<string, unknown>[] = []
  exchangeable: Record<string, unknown>[] = []
  bankPacks: Record<string, (Record<string, unknown> | null)[]> = {}
  bankGold = 0
  mailMessages: Record<string, unknown>[] = []
  standListings: Record<string, unknown>[] = []

  // Auto-mark state, mutated by POSTed commands - mirrors PartyStateDynamic's shape.
  autoNpcSales: Record<string, { item: MockItem; character?: string }> = {}

  paired = false

  addCharacter(character: MockCharacter): this {
    this.characters.push(character)
    for (const item of character.items ?? []) {
      if (item) this.catalogEntries[item.name] ??= { id: item.name, name: item.name }
    }
    return this
  }

  addCatalogEntry(entry: MockCatalogEntry): this {
    this.catalogEntries[entry.id] = entry
    return this
  }

  private roster() {
    return this.characters.map((c) => ({ name: c.name, ctype: c.ctype, level: c.level }))
  }

  private dynamicState(): Record<string, unknown> {
    return {
      bank: { gold: this.bankGold, packs: this.bankPacks },
      standListings: this.standListings,
      merchantCatalog: {
        allItems: Object.values(this.catalogEntries).map((entry) => ({ ...entry, sprite: testSprite() })),
        buyable: [],
        craftable: this.craftable,
        exchangeable: this.exchangeable,
      },
      autoNpcSales: this.autoNpcSales,
    }
  }

  private snapshotFrame(): string {
    const characters: Record<string, unknown> = {}
    for (const c of this.characters) {
      const items: Record<string, unknown> = {}
      ;(c.items ?? []).forEach((item, index) => {
        // The wire shape is InventoryEntry ({slot, item}), not the bare
        // item - recordToState() in the app casts this straight through.
        if (item) items[String(index)] = { slot: index, item }
      })
      characters[c.name] = {
        generation: 'g1',
        sample: 1,
        sampledAt: Date.now(),
        vitals: {
          hp: c.hp ?? 100,
          max_hp: c.max_hp ?? 100,
          mp: c.mp ?? 100,
          max_mp: c.max_mp ?? 100,
          gold: c.gold ?? 0,
          map: c.map ?? 'main',
          x: c.x ?? 0,
          y: c.y ?? 0,
          rip: false,
          inventorySize: (c.items ?? []).length,
        },
        items,
        slots: {},
      }
    }
    return `data: ${JSON.stringify({ type: 'snapshot', epoch: 'e1', sequence: 1, characters })}\n\n`
  }

  /** Applies one /party-api/command or /party-api/merchant/* POST body,
   *  mutating this mock's state where the real coordinator would. Only
   *  the command types these tests actually exercise are handled -
   *  anything else is accepted as a no-op success, matching how a real
   *  POST /party-api/command with an unhandled `type` still returns
   *  `{ok:true}` for fields the server simply ignores. */
  private applyCommand(path: string, body: Record<string, unknown>): Record<string, unknown> {
    if (path === 'merchant/auto-npc-sale') {
      // A rule on the configured merchant's OWN inventory is the
      // merchant's account-wide rule (character omitted); a rule on
      // anyone else's inventory is scoped to them - matches
      // AutoMarksSection's `isMerchant ? rule.character == null : ...`
      // filter, which never parses the map's own keys.
      const requestedCharacter = body.character as string | undefined
      const merchantName = this.characters.find((c) => c.ctype === 'merchant')?.name
      const character = requestedCharacter === merchantName ? undefined : requestedCharacter
      const key = `${(body.item as MockItem).name}@+${(body.item as MockItem).level ?? 0}`
      if (body.action === 'clear-all') {
        for (const k of Object.keys(this.autoNpcSales)) {
          if ((this.autoNpcSales[k].character ?? undefined) === character) delete this.autoNpcSales[k]
        }
      } else if (body.action === 'remove') {
        delete this.autoNpcSales[key]
      } else {
        this.autoNpcSales[key] = { item: body.item as MockItem, character }
      }
      return { ok: true }
    }
    if (path === 'merchant/npc-sale' && body.source === 'bank') {
      this.removeBankItem(String(body.pack), Number(body.slot))
      return { ok: true }
    }
    if (path === 'deconstruction/mark' && body.pack) {
      this.removeBankItem(String(body.pack), Number(body.slot))
      return { ok: true }
    }
    if (path === 'mail/collect') {
      const message = this.mailMessages.find((m) => m.id === body.id)
      if (message) message.taken = true
      return { ok: true }
    }
    if (path === 'merchant/order' || path === 'merchant/exchange-order') {
      this.lastOrder = body
      return { ok: true }
    }
    return { ok: true }
  }

  lastOrder: Record<string, unknown> | null = null

  private removeBankItem(pack: string, slot: number) {
    const entries = this.bankPacks[pack]
    if (entries) entries[slot] = null
  }

  /** Installs every route handler on [page]. Call before navigating. */
  async install(page: Page): Promise<void> {
    await page.route('**/e2e-sprite.png', (route) =>
      route.fulfill({ contentType: 'image/png', body: Buffer.from(TINY_PNG_BASE64, 'base64') }),
    )

    await page.route('**/setup/state', (route) => {
      if (this.paired) return route.fulfill({ status: 200, json: { ok: true } })
      return route.fulfill({ status: 401, json: { error: 'not paired' } })
    })
    await page.route('**/setup/pair', (route) => {
      this.paired = true
      return route.fulfill({ status: 200, json: { ok: true } })
    })

    await page.route('**/party-api/state**', (route) => {
      const url = new URL(route.request().url())
      if (url.searchParams.get('section') === 'logs') return route.fulfill({ json: { gameLogs: {} } })
      return route.fulfill({ json: { roster: this.roster(), ...this.dynamicState() } })
    })
    await page.route('**/party-api/mail**', (route) => route.fulfill({ json: { messages: this.mailMessages, count: this.mailMessages.length } }))
    await page.route('**/party-api/escape**', (route) => route.fulfill({ json: { escape: null } }))
    await page.route('**/party-api/dashboard-stream', (route) =>
      route.fulfill({ contentType: 'text/event-stream', body: this.snapshotFrame() }),
    )

    await page.route('**/party-api/command', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      route.fulfill({ json: this.applyCommand('command', body) })
    })
    await page.route('**/party-api/merchant/**', async (route) => {
      const url = new URL(route.request().url())
      const path = url.pathname.replace(/^.*\/party-api\//, '')
      const body = (route.request().postDataJSON() as Record<string, unknown>) ?? {}
      route.fulfill({ json: this.applyCommand(path, body) })
    })
    await page.route('**/party-api/deconstruction/**', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      route.fulfill({ json: this.applyCommand('deconstruction/mark', body) })
    })
    await page.route('**/party-api/mail/**', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      route.fulfill({ json: this.applyCommand('mail/collect', body) })
    })
  }
}
