import type { Page } from '@playwright/test'
import { createServer, type Server, type ServerResponse } from 'node:http'

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
  target?: string
  conditions?: { id: string; name: string; remainingMs?: number }[]
  // This character's own Hunt quest assignment - mirrors state.statuses[name].monsterHunt,
  // exposed via characterDetails in the real state?section=core&dashboard=1 response.
  monsterHunt?: { id: string | null; count: number; remainingMs?: number | null; server?: string | null }
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
  bestiaryCatalog: Record<string, unknown>[] = []
  skillCatalog: Record<string, unknown>[] = []
  combatLogs: Record<string, unknown[]> = {}
  merchantActivity: Record<string, unknown>[] = []
  merchantRoutinePriorities: Record<string, number> = {}
  merchantAutomations: Record<string, boolean> = {}
  standBids: Record<string, Record<string, unknown>> = {}
  aldataListings: Record<string, unknown>[] = []
  pontyListings: Record<string, unknown>[] = []
  realmControl: Record<string, unknown> | null = null
  upgradeOfferingRules: Record<string, unknown>[] = []
  huntBlacklist: Record<string, Record<string, unknown>> = {}
  huntSettings: Record<string, unknown> | null = null
  monsterHunt: Record<string, unknown> | null = null
  requirePairing = false
  // Both keyed by character - mirrors state.luckyUpgradeSlots/luckySlotTracking.
  luckyUpgradeSlots: Record<string, number> = {}
  luckySlotTracking: Record<string, Record<string, { version: 1; slots: Record<string, { totalRolls: number; sumRolls: number; rollsAbove96_3: number; perfectRolls: number }> }>> = {}
  // Pending bank withdrawals, keyed by the collecting character (usually
  // the merchant) - mirrors the coordinator's own `state.withdrawals`.
  withdrawals: Record<string, { pack: string; slot: number; item: MockItem }[]> = {}
  // Keyed by item id (matches item.name) - {} means nothing is
  // deconstructible unless a test explicitly opts an item in.
  deconstructionCatalog: Record<string, { compound: boolean; cost?: number; rewards?: unknown[] }> = {}

  // Auto-mark state, mutated by POSTed commands - mirrors PartyStateDynamic's shape.
  autoNpcSales: Record<string, { item: MockItem; character?: string }> = {}
  // Pending one-time inventory marks (not standing rules), keyed by
  // character - mirrors state.upgrades/compounds/statScrolls.
  upgrades: Record<string, { slot?: number | string; item: MockItem; tiers?: number; equipped?: boolean }[]> = {}
  compounds: Record<string, { id: string; name: string; items: { slot?: number | string; item: MockItem }[] }[]> = {}
  statScrolls: Record<string, { slot?: number | string; item: MockItem; statType: string }[]> = {}
  // Flat, account-wide - mirrors state.npcSaleMarks/deconstructionMarks.
  npcSaleMarks: { id: string; source?: string; pack?: string; character?: string; slot: number; item: MockItem; quantity: number }[] = []
  deconstructionMarks: { id: string; owner: string; slot: number; item: MockItem; quantity: number; state: string; storage?: { pack: string; slot: number } }[] = []
  // Keyed by the RECIPIENT's name - mirrors state.merchantDeliveries.
  merchantDeliveries: Record<string, { id: string; slot: number; item: MockItem; equipOnDelivery?: boolean }[]> = {}

  /** One-shot error injection for error-path tests: set
   *  `failOnce['merchant/bid'] = 'Stand is full'` before triggering the
   *  action - the NEXT matching POST fails with that message (via a real
   *  non-2xx CommandResult body, exactly like the coordinator), then
   *  reverts to normal success handling. */
  failOnce: Record<string, string> = {}

  lastOrder: Record<string, unknown> | null = null
  lastRoutineSave: Record<string, unknown> | null = null

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
        // `meta.upgradeable`/`meta.compoundable` (read by itemFormulas'
        // itemMaximumLevel) are a separate nested field from the
        // top-level convenience flags WtbScreen/etc. read directly -
        // synthesize both from the one flag addCatalogEntry takes.
        allItems: Object.values(this.catalogEntries).map((entry) => ({
          ...entry,
          sprite: testSprite(),
          meta: { definition: {}, upgradeable: entry.upgradeable, compoundable: entry.compoundable, maxLevel: entry.upgradeable ? 13 : entry.compoundable ? 7 : 0 },
        })),
        buyable: [],
        craftable: this.craftable,
        exchangeable: this.exchangeable,
      },
      autoNpcSales: this.autoNpcSales,
      upgrades: this.upgrades,
      compounds: this.compounds,
      statScrolls: this.statScrolls,
      npcSaleMarks: this.npcSaleMarks,
      deconstructionMarks: this.deconstructionMarks,
      merchantDeliveries: this.merchantDeliveries,
      withdrawals: this.withdrawals,
      deconstructionCatalog: this.deconstructionCatalog,
      bestiaryCatalog: this.bestiaryCatalog,
      skillCatalog: this.skillCatalog,
      combatLogs: this.combatLogs,
      merchantActivity: this.merchantActivity,
      merchantRoutinePriorities: this.merchantRoutinePriorities,
      merchantAutomations: this.merchantAutomations,
      standBids: this.standBids,
      realmControl: this.realmControl,
      upgradeOfferingRules: this.upgradeOfferingRules,
      luckyUpgradeSlots: this.luckyUpgradeSlots,
      luckySlotTracking: this.luckySlotTracking,
      huntBlacklist: this.huntBlacklist,
      huntSettings: this.huntSettings,
      monsterHunt: this.monsterHunt,
      aldata: { listings: this.aldataListings },
      ponty: { listings: this.pontyListings },
      // Real shape of state?section=core&dashboard=1's own extra field -
      // see diagnosticCharacters() server-side, which allowlists monsterHunt.
      characterDetails: Object.fromEntries(
        this.characters.map((c) => [c.name, { monsterHunt: c.monsterHunt ?? null }]),
      ),
    }
  }

  private snapshotPayload(sequence: number): Record<string, unknown> {
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
          ...(c.target ? { target: c.target } : {}),
          ...(c.conditions ? { conditions: c.conditions } : {}),
        },
        items,
        slots: {},
      }
    }
    return { type: 'snapshot', epoch: 'e1', sequence, characters }
  }

  private sseServer: Server | null = null
  private sseClients = new Set<ServerResponse>()
  private sseSequence = 1

  /** A REAL persistent text/event-stream server - not a Playwright
   *  `route.fulfill()`, which sends one complete response and closes the
   *  connection. That one-shot close is exactly the failure mode
   *  liveConnection.ts's reconnect logic exists to recover from: the app
   *  would genuinely see a disconnect/reconnect cycle every ~1s, cycling
   *  the "connected" indicator, instead of the stable always-open
   *  connection a real server holds open. Started lazily; the app's
   *  EventSource is redirected here via `route.continue({url})` in
   *  install(), which lets the browser's own networking connect to it
   *  directly (Playwright's fulfill API has no incremental-write mode). */
  private startSseServer(): Promise<string> {
    if (this.sseServer) {
      const address = this.sseServer.address()
      return Promise.resolve(`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/dashboard-stream`)
    }
    return new Promise((resolve) => {
      const server = createServer((req, res) => {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        })
        res.write(`data: ${JSON.stringify(this.snapshotPayload(this.sseSequence++))}\n\n`)
        this.sseClients.add(res)
        req.on('close', () => this.sseClients.delete(res))
      })
      this.sseServer = server
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        const port = typeof address === 'object' && address ? address.port : 0
        // A heartbeat keeps every open connection well within
        // liveConnection.ts's 15s watchdog timeout indefinitely, matching
        // the real coordinator's own heartbeat cadence.
        setInterval(() => this.broadcastHeartbeat(), 2000).unref()
        resolve(`http://127.0.0.1:${port}/dashboard-stream`)
      })
    })
  }

  private broadcastHeartbeat() {
    const frame = `data: ${JSON.stringify({ type: 'heartbeat', epoch: 'e1', sequence: this.sseSequence++ })}\n\n`
    for (const client of this.sseClients) client.write(frame)
  }

  private stopSseServer() {
    for (const client of this.sseClients) client.end()
    this.sseClients.clear()
    this.sseServer?.close()
    this.sseServer = null
  }

  /** Applies one POST body against the given logical /party-api/<path>,
   *  mutating this mock's state where the real coordinator would. Only
   *  the command types these tests actually exercise are handled -
   *  anything else is accepted as a no-op success, matching how a real
   *  POST /party-api/command with an unhandled `type` still returns
   *  `{ok:true}` for fields the server simply ignores. */
  private applyCommand(path: string, body: Record<string, unknown>): { status: number; json: Record<string, unknown> } {
    if (this.failOnce[path] !== undefined) {
      const error = this.failOnce[path]
      delete this.failOnce[path]
      return { status: 409, json: { ok: false, error } }
    }
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
      return { status: 200, json: { ok: true } }
    }
    if (path === 'merchant/npc-sale' && !body.remove) {
      // Mirrors npc-sale.ts's validate(): the merchant's own items can
      // never use source "character" (that's rejected server-side with
      // this exact error), and any modified item (level>0/stat_type/p)
      // needs an explicit acknowledgement or the sale is refused outright.
      const merchantName = this.characters.find((c) => c.ctype === 'merchant')?.name
      if (body.source === 'character' && body.character === merchantName) {
        return { status: 400, json: { ok: false, error: 'Unknown player character' } }
      }
      const item = body.item as MockItem
      const modified = Number(item.level) > 0 || !!item.stat_type || !!item.p
      if (modified && body.acknowledged !== true) {
        return { status: 400, json: { ok: false, error: 'confirm the modified-item warning before selling' } }
      }
    }
    if (path === 'merchant/npc-sale' && body.source === 'merchant') {
      const slot = Number(body.slot)
      if (body.remove) {
        this.npcSaleMarks = this.npcSaleMarks.filter((mark) => !(mark.source === 'merchant' && mark.slot === slot))
      } else {
        this.npcSaleMarks.push({
          id: `npc-sale-${this.npcSaleMarks.length + 1}`,
          source: 'merchant',
          slot,
          item: body.item as MockItem,
          quantity: Number(body.quantity) || 1,
        })
      }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'merchant/npc-sale' && body.source === 'bank') {
      // Bank-sourced NPC sales queue for the merchant to actually collect
      // and sell, same as the real server (npc-sale.ts sets state:
      // "queued", not an instant removal) - the item stays put until then.
      const pack = String(body.pack)
      const slot = Number(body.slot)
      if (body.remove) {
        this.npcSaleMarks = this.npcSaleMarks.filter((mark) => !(mark.source === 'bank' && mark.pack === pack && mark.slot === slot))
      } else {
        this.npcSaleMarks.push({
          id: `npc-sale-${this.npcSaleMarks.length + 1}`,
          source: 'bank',
          pack,
          slot,
          item: body.item as MockItem,
          quantity: Number(body.quantity) || 1,
        })
      }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'merchant/npc-sale' && body.source === 'character') {
      const character = String(body.character)
      if (body.remove) {
        this.npcSaleMarks = this.npcSaleMarks.filter((mark) => !(mark.character === character && mark.slot === Number(body.slot)))
      } else {
        this.npcSaleMarks.push({
          id: `npc-sale-${this.npcSaleMarks.length + 1}`,
          source: 'character',
          character,
          slot: Number(body.slot),
          item: body.item as MockItem,
          quantity: Number(body.quantity) || 1,
        })
      }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'deconstruction/mark' && body.pack) {
      // Bank-sourced deconstruction also queues (bank-deconstruction.ts
      // pushes a mark with `storage:{pack,slot}` and a real `slot` of -1,
      // matching the real server) - the item stays in the pack until the
      // merchant actually collects and deconstructs it.
      const push = (pack: string, slot: number, item: MockItem) =>
        this.deconstructionMarks.push({
          id: `deconstruction-${this.deconstructionMarks.length + 1}`,
          owner: String(this.characters.find((c) => c.ctype === 'merchant')?.name ?? ''),
          slot: -1,
          item,
          quantity: Number(item.q) || 1,
          state: 'collecting',
          storage: { pack, slot },
        })
      if (body.all) this.forEachMatchingBankItem((body.item as MockItem).name, (pack, slot, item) => push(pack, slot, item))
      else push(String(body.pack), Number(body.slot), body.item as MockItem)
      return { status: 200, json: { ok: true } }
    }
    if (path === 'deconstruction/mark' && body.character) {
      const owner = String(body.character)
      if (body.remove) {
        this.deconstructionMarks = this.deconstructionMarks.filter((mark) => !(mark.owner === owner && mark.slot === Number(body.slot)))
      } else {
        this.deconstructionMarks.push({
          id: `deconstruction-${this.deconstructionMarks.length + 1}`,
          owner,
          slot: Number(body.slot),
          item: body.item as MockItem,
          quantity: Number((body.item as MockItem).q) || 1,
          state: 'collecting',
        })
      }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'command' && body.type === 'withdraw') {
      const character = String(body.character)
      const item = body.item as MockItem
      const pending = (this.withdrawals[character] ??= [])
      if (body.markAll === true) {
        this.forEachMatchingBankItem(item.name, (pack, slot, matchedItem) => {
          if (!pending.some((w) => w.pack === pack && w.slot === slot)) pending.push({ pack, slot, item: matchedItem })
        })
      } else {
        const index = pending.findIndex((w) => w.pack === body.pack && w.slot === Number(body.slot))
        if (index >= 0) pending.splice(index, 1)
        else pending.push({ pack: String(body.pack), slot: Number(body.slot), item })
      }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'merchant/stand') {
      if (body.remove) {
        // A bank-originated listing is removed by id (BankScreen passes
        // it back); a carried-inventory listing (StandScreen) has none
        // and is removed by slot instead - matches markForStand's two
        // real call sites.
        this.standListings = this.standListings.filter((l) => (body.id ? l.id !== body.id : l.slot !== body.slot))
      } else {
        this.standListings.push({
          id: `stand-${this.standListings.length + 1}`,
          item: body.item,
          price: Number(body.price) || 0,
          quantity: Number(body.quantity) || 1,
          bankPack: body.bankPack,
          bankSlot: body.slot,
        })
      }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'mail/collect') {
      const message = this.mailMessages.find((m) => m.id === body.id)
      if (message) message.taken = true
      return { status: 200, json: { ok: true } }
    }
    if (
      path === 'merchant/order' ||
      path === 'merchant/exchange-order' ||
      path === 'merchant/aldata-order' ||
      path === 'merchant/ponty-order' ||
      path === 'merchant/stand-order' ||
      path === 'merchant/send-mail'
    ) {
      this.lastOrder = { path, ...body }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'hunt-settings') {
      this.huntSettings = { ...(this.huntSettings ?? {}), ...body }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'hunt-blacklist') {
      if (body.action === 'clear') this.huntBlacklist = {}
      else if (body.action === 'remove') delete this.huntBlacklist[String(body.monsterId)]
      return { status: 200, json: { ok: true } }
    }
    if (path === 'merchant/routine-priorities') {
      this.lastRoutineSave = body
      this.merchantRoutinePriorities = { ...this.merchantRoutinePriorities, ...(body.priorities as Record<string, number>) }
      this.merchantAutomations = { ...this.merchantAutomations, ...(body.enabled as Record<string, boolean>) }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'merchant/bid') {
      const itemId = String(body.itemId)
      if (body.clear) delete this.standBids[itemId]
      else {
        const { itemId: _itemId, clear: _clear, ...rest } = body
        this.standBids[itemId] = rest
      }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'realm/switch') {
      this.realmControl = { ...(this.realmControl ?? {}), activeRealm: body.realm, ...(body.setHome ? { homeRealm: body.realm } : {}) }
      return { status: 200, json: { ok: true } }
    }
    if (path === 'command' && body.type === 'give') {
      const target = String(body.target)
      const slot = Number(body.slot)
      const item = body.item as MockItem
      // Mirrors transfer-commands.ts's delivery(): drop any existing
      // delivery for this exact slot+item from every recipient first, then
      // queue it for the new target - a delivery is never split/duplicated.
      for (const name of Object.keys(this.merchantDeliveries)) {
        this.merchantDeliveries[name] = this.merchantDeliveries[name].filter((mark) => !(mark.slot === slot && mark.item.name === item.name && mark.item.level === item.level))
      }
      ;(this.merchantDeliveries[target] ??= []).push({
        id: `delivery-${target}-${slot}`,
        slot,
        item,
        equipOnDelivery: body.equipOnDelivery === true,
      })
      return { status: 200, json: { ok: true } }
    }
    if (path === 'command' && body.type === 'upgrade-mark') {
      const character = String(body.character)
      const pending = (this.upgrades[character] ??= [])
      pending.push({ slot: body.slot as number | string | undefined, item: body.item as MockItem, tiers: Number(body.tiers) || 1, equipped: body.equipped === true })
      return { status: 200, json: { ok: true } }
    }
    if (path === 'command' && body.type === 'compound-mark') {
      const character = String(body.character)
      const group = (this.compounds[character] ??= [])
      group.push({ id: `compound-${group.length + 1}`, name: (body.item as MockItem).name, items: [{ slot: body.slot as number | string | undefined, item: body.item as MockItem }] })
      return { status: 200, json: { ok: true } }
    }
    if (path === 'command' && body.type === 'stat-scroll-mark') {
      const character = String(body.character)
      const pending = (this.statScrolls[character] ??= [])
      pending.push({ slot: body.slot as number | string | undefined, item: body.item as MockItem, statType: String(body.statType) })
      return { status: 200, json: { ok: true } }
    }
    if (path === 'command' && body.type === 'upgrade-offering-rule') {
      const rule = body.rule as Record<string, unknown>
      if (body.remove) {
        this.upgradeOfferingRules = this.upgradeOfferingRules.filter((r) => r.id !== rule.id)
      } else if (rule.id) {
        this.upgradeOfferingRules = this.upgradeOfferingRules.map((r) => (r.id === rule.id ? { ...r, ...rule } : r))
      } else {
        this.upgradeOfferingRules.push({ ...rule, id: `rule-${this.upgradeOfferingRules.length + 1}` })
      }
      return { status: 200, json: { ok: true } }
    }
    return { status: 200, json: { ok: true } }
  }

  private removeBankItem(pack: string, slot: number) {
    const entries = this.bankPacks[pack]
    if (entries) entries[slot] = null
  }

  private forEachMatchingBankItem(itemName: string, fn: (pack: string, slot: number, item: MockItem) => void) {
    for (const [pack, entries] of Object.entries(this.bankPacks)) {
      entries.forEach((entry, index) => {
        const candidate = entry as { slot?: number; item?: MockItem } | null
        if (candidate?.item?.name === itemName) fn(pack, candidate.slot ?? index, candidate.item!)
      })
    }
  }

  /** Installs every route handler on [page]. Call before navigating.
   *  Registration order matters: Playwright checks the MOST recently
   *  registered route first, so the broad party-api fallback is
   *  registered first (lowest priority) and specific handlers after it
   *  (highest priority) - matching how a test's own late `page.route()`
   *  override (e.g. account-screens.spec.ts's Stand removal) still wins
   *  over anything installed here. */
  async install(page: Page): Promise<void> {
    await page.route('**/e2e-sprite.png', (route) =>
      route.fulfill({ contentType: 'image/png', body: Buffer.from(TINY_PNG_BASE64, 'base64') }),
    )

    // Broad fallback for every /party-api/* POST not given a specific
    // handler below (hunt-settings, hunt-blacklist, realm/switch,
    // merchant/bid, merchant/routine-priorities, command, merchant/**,
    // deconstruction/**, mail/**, ...). GETs not otherwise handled get an
    // empty object rather than a 404, since several settings-only reads
    // (ALData's key/auth checks) aren't modeled by this mock.
    await page.route('**/party-api/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const path = url.pathname.replace(/^.*\/party-api\//, '')
      if (request.method() !== 'POST') return route.fulfill({ json: {} })
      const body = (request.postDataJSON() as Record<string, unknown>) ?? {}
      const result = this.applyCommand(path, body)
      return route.fulfill({ status: result.status, json: result.json })
    })

    await page.route('**/setup/state', (route) => {
      if (this.paired) return route.fulfill({ status: 200, json: { ok: true, requirePairing: this.requirePairing } })
      return route.fulfill({ status: 401, json: { error: 'not paired' } })
    })
    await page.route('**/setup/pair', (route) => {
      this.paired = true
      return route.fulfill({ status: 200, json: { ok: true } })
    })
    await page.route('**/setup/pairing', async (route) => {
      const body = (route.request().postDataJSON() as { requirePairing?: boolean }) ?? {}
      if (typeof body.requirePairing === 'boolean') this.requirePairing = body.requirePairing
      return route.fulfill({ json: { ok: true } })
    })

    await page.route('**/party-api/state**', (route) => {
      const url = new URL(route.request().url())
      if (url.searchParams.get('section') === 'logs')
        return route.fulfill({ json: { gameLogs: {}, combatLogs: this.combatLogs, merchantActivity: this.merchantActivity } })
      return route.fulfill({ json: { roster: this.roster(), ...this.dynamicState() } })
    })
    await page.route('**/party-api/mail**', (route) => {
      // This pattern also matches POST /party-api/mail/collect - defer
      // that to the broad command fallback registered above (lower
      // priority) instead of wrongly answering it with the inbox snapshot.
      if (route.request().method() !== 'GET') return route.fallback()
      return route.fulfill({ json: { messages: this.mailMessages, count: this.mailMessages.length } })
    })
    await page.route('**/party-api/escape**', (route) => route.fulfill({ json: { escape: null } }))
    await page.route('**/party-api/dashboard-stream', async (route) => {
      const url = await this.startSseServer()
      return route.continue({ url })
    })

    page.once('close', () => this.stopSseServer())
  }
}
