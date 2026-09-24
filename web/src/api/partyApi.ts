import type { Item, StandSearchListing } from '@/models'
import { apiBase, type ServerSettings } from '@/config/serverConfig'

export interface CommandResult {
  ok: boolean
  error?: string
}

export type ApiResult<T> = { kind: 'success'; value: T } | { kind: 'failure'; message: string }

const ok = <T>(value: T): ApiResult<T> => ({ kind: 'success', value })
const fail = <T = never>(message: string): ApiResult<T> => ({ kind: 'failure', message })

// Bounded like the Android app's REST client (15s) - a request that
// stalls after connecting (a network hiccup, a dropped Tailscale route)
// must actually fail so callers' own retry logic gets a chance, instead
// of hanging the UI forever with nothing to time it out. fetch() has no
// built-in timeout, unlike OkHttp, so this is done via AbortController.
const REQUEST_TIMEOUT_MS = 15_000

async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function getText(url: string): Promise<ApiResult<string>> {
  try {
    const response = await timedFetch(url)
    const text = await response.text()
    return response.ok ? ok(text) : fail(`HTTP ${response.status}`)
  } catch (error) {
    return fail(errorMessage(error))
  }
}

async function postJson(url: string, body: unknown): Promise<ApiResult<string>> {
  try {
    const response = await timedFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await response.text()
    return response.ok ? ok(text) : fail(`HTTP ${response.status}`)
  } catch (error) {
    return fail(errorMessage(error))
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'Request timed out'
  if (error instanceof Error) return error.message
  return 'network error'
}

function parseCommandResult(text: string): CommandResult {
  try {
    const parsed = JSON.parse(text) as Partial<CommandResult>
    return { ok: parsed.ok ?? true, error: parsed.error }
  } catch {
    return { ok: true }
  }
}

/** Thin wrapper over the party-api REST surface, porting network/
 *  PartyApiClient.kt 1:1 - every command shape here was verified against
 *  the real coordinator source this project's whole way through; add a
 *  typed method here as each new screen needs one rather than guessing. */
export class PartyApiClient {
  private readonly settings: ServerSettings

  constructor(settings: ServerSettings) {
    this.settings = settings
  }

  private url(path: string): string {
    return `${apiBase(this.settings).replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
  }

  private rootUrl(path: string): string {
    return `${this.settings.baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
  }

  /** GET against the party-api base - used for one-shot reads like
   *  /party-api/state that don't belong on the SSE stream. Returns the
   *  raw body string; callers decode with the exact slice-type they need. */
  async get(path: string): Promise<ApiResult<string>> {
    return getText(this.url(path))
  }

  async getRoot(path: string): Promise<ApiResult<string>> {
    return getText(this.rootUrl(path))
  }

  async postRoot(path: string, body: unknown): Promise<ApiResult<string>> {
    return postJson(this.rootUrl(path), body)
  }

  async post(path: string, body: unknown): Promise<ApiResult<CommandResult>> {
    const result = await postJson(this.url(path), body)
    if (result.kind === 'failure') {
      // A failed POST's body might still carry a CommandResult with a
      // real server-side error message - fall back to the raw HTTP
      // status only when the body isn't parseable as one.
      return result
    }
    return ok(parseCommandResult(result.value))
  }

  /** `/party-api/command` - the general-purpose command endpoint:
   *  character name plus whatever domain-specific fields that command
   *  needs. */
  async sendCommand(character: string, fields: Record<string, unknown>): Promise<ApiResult<CommandResult>> {
    return this.post('command', { character, ...fields })
  }

  /** Every item-mark/equip/use/give command on /party-api/command needs
   *  the FULL item object in its `item` field, not just its name - the
   *  server verifies identity against it rather than trusting a bare
   *  name/slot pair. [slot] varies by action: a number (inventory index)
   *  for most, a string equip-slot name (e.g. "mainhand") for unequip. */
  async itemCommand(
    type: string,
    character: string,
    item: Item,
    slot?: number | string | null,
    extra: Record<string, unknown> = {},
  ): Promise<ApiResult<CommandResult>> {
    const body: Record<string, unknown> = { type, character, item, ...extra }
    if (slot !== undefined && slot !== null) body.slot = slot
    return this.post('command', body)
  }

  /** POST /party-api/formation - leader is the party leader's name (or
   *  null to clear it), independent of follow, this character's own
   *  follow-the-leader toggle. */
  async setFormation(leader: string | null, character: string, follow: boolean): Promise<ApiResult<CommandResult>> {
    return this.post('formation', { character, follow, leader })
  }

  /** POST /party-api/restock - one character's HP/MP auto-potion
   *  thresholds. */
  async saveRestock(character: string, hpMin: number, hpMax: number, mpMin: number, mpMax: number): Promise<ApiResult<CommandResult>> {
    return this.post('restock', {
      character,
      hp: { min: hpMin, max: hpMax },
      mp: { min: mpMin, max: mpMax },
    })
  }

  /** `/party-api/command` type "withdraw" - pulls one item out of the
   *  shared bank to a character's own bag. `pack` is the bank pack name,
   *  `slot` is that pack's slot index. */
  async withdrawFromBank(character: string, item: Item, pack: string, slot: number, markAll = false): Promise<ApiResult<CommandResult>> {
    const extra: Record<string, unknown> = { pack }
    if (markAll) extra.markAll = true
    return this.itemCommand('withdraw', character, item, slot, extra)
  }

  /** POST /party-api/merchant/stand - list an inventory item on the
   *  merchant's stand. Own route, not /command. */
  async markForStand(item: Item, slot: number, price: number, options: { bankPack?: string; quantity?: number; remove?: boolean } = {}): Promise<ApiResult<CommandResult>> {
    const { bankPack, quantity = 1, remove = false } = options
    return this.post('merchant/stand', { item, slot, bankPack, price, quantity, remove })
  }

  /** POST /party-api/merchant/npc-sale - source is always "character"
   *  from the item-action panel (bank-side NPC sales are the bank
   *  screen's own concern). */
  async markForNpcSale(character: string, item: Item, slot: number, quantity = 1, remove = false): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/npc-sale', { source: 'character', character, slot, item, quantity, remove })
  }

  /** POST /party-api/merchant/npc-sale with source "bank" - sells a bank
   *  item directly without withdrawing it to a character first. */
  async sellBankItemToNpc(item: Item, pack: string, slot: number, quantity = 1, remove = false): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/npc-sale', { source: 'bank', pack, slot, item, quantity, remove })
  }

  /** POST /party-api/deconstruction/mark, triggered by `pack` being
   *  present - marks a bank item for scrap without withdrawing it first. */
  async markBankItemForDeconstruction(item: Item, pack: string, slot: number): Promise<ApiResult<CommandResult>> {
    return this.post('deconstruction/mark', { item, pack, slot })
  }

  async markForDeconstruction(character: string, item: Item, slot: number, remove = false): Promise<ApiResult<CommandResult>> {
    return this.post('deconstruction/mark', { character, item, slot, remove })
  }

  /** POST /party-api/deconstruction/auto - a standing "always
   *  deconstruct this item type" rule, separate from marking one
   *  instance. */
  async autoDeconstruct(character: string, item: Item, remove = false): Promise<ApiResult<CommandResult>> {
    const body: Record<string, unknown> = { character, item }
    if (remove) body.remove = true
    return this.post('deconstruction/auto', body)
  }

  /** POST /party-api/merchant/auto-npc-sale - a standing "always sell
   *  this item type to an NPC" rule. */
  async autoNpcSale(character: string, item: Item, remove = false): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/auto-npc-sale', { character, item, action: remove ? 'remove' : 'set' })
  }

  /** POST /party-api/merchant/auto-stand - a standing "always list this
   *  item type on the stand at this price" rule, merchant-only. */
  async autoStand(character: string, item: Item, price: number, remove = false): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/auto-stand', { character, item, price, action: remove ? 'remove' : 'set' })
  }

  /** POST /party-api/merchant/order - queues an NPC buy and/or crafting
   *  job. The server recomputes each buy line's upgrade-attempt budget
   *  itself (runtime/coordinator/http/merchant-order.ts's estimate())
   *  before queuing - `level` (the desired target level for an
   *  upgradeable buy) is the only field worth sending from here; any
   *  client-side cost estimate is display-only. */
  async submitMerchantOrder(
    buys: { id: string; quantity: number; level?: number }[],
    crafts: { id: string; quantity: number }[],
    removeAutoBankMark = false,
  ): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/order', { buys, crafts, removeAutoBankMark })
  }

  /** POST /party-api/merchant/exchange-order - NPC exchange/box
   *  operations, a separate endpoint from buy/craft (no `type` field). */
  async submitExchangeOrder(
    exchanges: { id: string; quantity: number; level?: number; reward?: string }[],
  ): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/exchange-order', { exchanges })
  }

  /** `/party-api/command` type "character-travel" - sends one character
   *  to a preset map location (see models/state.ts's TravelPlace). */
  async sendCharacterTo(character: string, map: string, x: number, y: number, label: string): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(character, { type: 'character-travel', location: { map, x, y }, label })
  }

  /** `/party-api/command` type "return-leader" - rendezvous back with the
   *  current party leader. Server requires a different, currently-online
   *  leader to exist. */
  async returnToLeader(character: string): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(character, { type: 'return-leader' })
  }

  /** `/party-api/command` type "remove-auto-item-mark" - removes one
   *  standing auto-bank/auto-merchant rule by its rule key. Deliberately
   *  no `item` field: the server-side handler for this type never
   *  requires one. */
  async removeAutoItemMark(character: string, mode: string, ruleKey: string): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(character, { type: 'remove-auto-item-mark', mode, ruleKey })
  }

  /** `/party-api/command` type "update-auto-upgrade-rule" with remove -
   *  removes one standing auto-upgrade rule by its rule key. */
  async removeAutoUpgradeRule(owner: string, item: Item, ruleKey: string): Promise<ApiResult<CommandResult>> {
    return this.itemCommand('update-auto-upgrade-rule', owner, item, null, { ruleKey, remove: true })
  }

  /** `/party-api/command` type "auto-compound-mark" with remove - the
   *  same command that CREATES the rule, just with remove=true. */
  async removeAutoCompound(owner: string, name: string, targetTier: number): Promise<ApiResult<CommandResult>> {
    return this.itemCommand('auto-compound-mark', owner, { name }, null, { targetTier, remove: true })
  }

  /** POST /party-api/merchant/force-stand - pauses ALL merchant work and
   *  returns them home to run the stand exclusively; disabling lets
   *  queued work resume. */
  async setForceStand(enabled: boolean): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/force-stand', { enabled })
  }

  /** POST /party-api/merchant/gather - toggles a standing gathering mode
   *  (mining/fishing) the merchant does between other jobs. */
  async setGathering(mode: 'mining' | 'fishing', enabled: boolean): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/gather', { mode, enabled })
  }

  /** POST /party-api/merchant/job/retry - clears a realm-blocked queued
   *  job's retry backoff so it's attempted again immediately. */
  async retryMerchantJob(id: string): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/job/retry', { id })
  }

  /** POST /party-api/merchant/clear - drops the ENTIRE merchant job queue
   *  and gathering modes, not just one job (see merchant/job/cancel for
   *  that). No confirmation server-side, so callers should confirm first. */
  async clearMerchantQueue(): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/clear', {})
  }

  /** POST /party-api/merchant/donate - queues an in-game gold donation
   *  (server computes and returns the XP it'll earn, at the account's own
   *  donationXpPerGold rate - not something worth re-deriving client-side). */
  async donateGold(amount: number): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/donate', { amount })
  }

  /** POST /party-api/merchant/join-giveaway - realm is normalized server-
   *  side ("US I"/"EU II" style input both work), so no local formatting
   *  needed before sending. */
  async joinGiveaway(seller: string, realm: string): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/join-giveaway', { seller, realm })
  }

  /** POST /party-api/bank-party - has the merchant visit party members to
   *  collect gold/items. Omitting `group` auto-selects when the account
   *  only has one party group (the common case); with more than one, the
   *  server 409s with the group list rather than guessing - surfaced as a
   *  plain error here rather than a group picker (not built yet). */
  async sendMerchantToParty(group?: string): Promise<ApiResult<CommandResult>> {
    return this.post('bank-party', group ? { group } : {})
  }

  /** POST /party-api/merchant/stale-orders/clear - drops delivery/bank-
   *  mark records for items no longer actually in the merchant's
   *  inventory (a recovery action, not a normal workflow step). */
  async clearStaleOrders(): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/stale-orders/clear', {})
  }

  /** POST /party-api/merchant/activity/clear - clears the merchant
   *  activity log shown on the Logs screen. */
  async clearMerchantActivity(): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/activity/clear', {})
  }

  /** POST /party-api/realm/switch - moves every active character to a
   *  different Adventure Land realm together. Server refuses PVP realms
   *  and refuses if a switch/bankboi transaction is already running -
   *  surface the returned error rather than assume success. */
  async switchRealm(realm: string, setHome = false): Promise<ApiResult<CommandResult>> {
    return this.post('realm/switch', { realm, setHome })
  }

  /** POST /party-api/dashboard-preferences - the bankboi mule-character
   *  naming prefix. */
  async setBankboiPrefix(prefix: string): Promise<ApiResult<CommandResult>> {
    return this.post('dashboard-preferences', { bankboiPrefix: prefix })
  }

  /** POST /party-api/merchant/send-mail. Server-side validation this app
   *  should match before calling: recipient ^[A-Za-z0-9_]{1,40}$,
   *  subject 1-74 chars, message <=1000 chars. No item/gold attachment
   *  for v1. */
  async sendMail(recipient: string, subject: string, message: string): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/send-mail', { recipient, subject, message })
  }

  /** POST /party-api/mail/collect - collects an attached item/gold from a
   *  received message by its id. */
  async collectMail(id: string): Promise<ApiResult<CommandResult>> {
    return this.post('mail/collect', { id })
  }

  /** POST /party-api/merchant/aldata-order - buys from one ALData public
   *  listing. Server only reads the listing's `key` plus the desired
   *  quantity; it must still exist and be fresh (<120s old). */
  async buyAlData(listingKey: string, buyQuantity: number): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/aldata-order', { listing: { key: listingKey }, buyQuantity })
  }

  /** POST /party-api/merchant/ponty-order - `keys` lets the server
   *  combine several Ponty listings into one purchase; this app always
   *  buys a single listing. */
  async buyPonty(listingKey: string, quantity: number, unitPrice: number): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/ponty-order', { keys: [listingKey], quantity, unitPrice })
  }

  /** POST /party-api/merchant/stand-search - starts a live search for a
   *  specific item across nearby players' open stands; results land in
   *  GET /party-api/state's `standSearch` field (polled), not this call's
   *  own response. */
  async standSearch(itemId: string): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/stand-search', { itemId })
  }

  /** POST /party-api/merchant/stand-order - buys one live player-stand
   *  listing. The server re-matches by seller+slot+rid+item.name+price,
   *  so this echoes those exact fields back from the search result
   *  rather than re-deriving them. */
  async buyFromStand(listing: StandSearchListing, buyQuantity: number): Promise<ApiResult<CommandResult>> {
    const entry: Record<string, unknown> = {
      seller: listing.seller,
      slot: listing.slot,
      itemName: listing.item.name,
      price: listing.price,
      buyQuantity,
    }
    if (listing.rid) entry.rid = listing.rid
    return this.post('merchant/stand-order', { listings: [entry] })
  }
}
