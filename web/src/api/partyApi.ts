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
   *  merchant's stand, or edit an existing listing in place by passing its
   *  `id` (stand-marks.ts's update() finds the existing mark by id/pack/
   *  slot/item and reuses the same slot rather than creating a new one). */
  async markForStand(
    item: Item,
    slot: number,
    price: number,
    options: { bankPack?: string; quantity?: number; remove?: boolean; id?: string } = {},
  ): Promise<ApiResult<CommandResult>> {
    const { bankPack, quantity = 1, remove = false, id } = options
    return this.post('merchant/stand', { id, item, slot, bankPack, price, quantity, remove })
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

  /** POST /party-api/bank/unlock (http/bank-unlock.ts) - queues a merchant
   *  errand to open one locked bank pack. `kind: 'key'` unlocks a floor's
   *  first (0-gold) vault using an owned key item; omitted, it spends
   *  `vault.gold` to open an already-accessible vault. The server enforces
   *  ordering/ownership and returns a specific error otherwise. */
  async unlockBankVault(pack: string, kind?: 'key'): Promise<ApiResult<CommandResult>> {
    return this.post('bank/unlock', { pack, kind })
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

  /** POST /party-api/merchant/auto-npc-sale with action "clear-all"
   *  (automatic-sales.ts) - drops every auto-NPC-sale rule scoped to
   *  `character` (undefined clears the merchant's own account-wide rules,
   *  matching how npcEntries filters by `rule.character == null`). */
  async clearAllAutoNpcSales(character?: string): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/auto-npc-sale', { action: 'clear-all', character })
  }

  /** POST /party-api/merchant/auto-stand with action "clear-all" -
   *  merchant-only, account-wide (no character scoping server-side). */
  async clearAllAutoStand(): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/auto-stand', { action: 'clear-all' })
  }

  /** `/party-api/command` type "clear-auto-upgrades"/"clear-auto-compounds"
   *  (compound-commands.ts) - drops EVERY owner's rules at once; the
   *  server requires `character` to be the configured merchant. */
  async clearAutoUpgrades(merchantCharacter: string): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(merchantCharacter, { type: 'clear-auto-upgrades' })
  }
  async clearAutoCompounds(merchantCharacter: string): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(merchantCharacter, { type: 'clear-auto-compounds' })
  }

  /** `/party-api/command` type "clear-auto-item-marks" - drops `character`'s
   *  own auto-bank/auto-merchant rules for the given mode. */
  async clearAutoItemMarks(character: string, mode: 'bank' | 'merchant'): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(character, { type: 'clear-auto-item-marks', mode })
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

  /** POST /party-api/town-party (party-actions.ts's town()) - sends EVERY
   *  active character to town at once, distinct from sendCharacterTo's
   *  per-character travel. */
  async sendPartyToTown(): Promise<ApiResult<CommandResult>> {
    return this.post('town-party', {})
  }

  /** POST /party-api/escape (party-actions.ts's escape()) - the party-wide
   *  emergency-recovery command: needs one online warrior/mage/priest, the
   *  server owns the whole staged rendezvous/convoy-fallback sequence.
   *  Poll GET /party-api/escape (useEscapeStatus) for `stage`/`error`. */
  async triggerEscape(): Promise<ApiResult<CommandResult>> {
    return this.post('escape', {})
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

  /** POST /party-api/merchant/routine-priorities - reorders/enables the
   *  merchant's automatic-routine scheduling (routine-priorities-
   *  dialog.tsx). `priorities` only needs entries that actually changed
   *  (server merges), but sending the full map is simplest and always
   *  valid. `enabled` only applies to automatic routines - server ignores
   *  keys outside that set. */
  async saveRoutinePriorities(priorities: Record<string, number>, enabled: Record<string, boolean>): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/routine-priorities', { priorities, enabled })
  }

  /** POST /party-api/merchant/bank-sort - `mode: "automatic"` sorts every
   *  visit; `mode: "request"` only sorts when a one-time request is
   *  queued via `enabled: true` (see also BankScreen's own simpler
   *  "sort on next visit" toggle, which just sends `{enabled}`). */
  async setBankSortMode(mode: 'automatic' | 'request'): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/bank-sort', { mode })
  }
  async requestBankSort(enabled: boolean): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/bank-sort', { enabled })
  }

  /** POST /party-api/config - either or both of `threshold` (gold-
   *  carrying threshold before auto-banking) and `itemCollectionThreshold`
   *  (1-42, marked-slot count before a collection trip queues) in one
   *  call; omit whichever one isn't changing. */
  async setThresholds(threshold?: number, itemCollectionThreshold?: number): Promise<ApiResult<CommandResult>> {
    const body: Record<string, unknown> = {}
    if (threshold !== undefined) body.threshold = threshold
    if (itemCollectionThreshold !== undefined) body.itemCollectionThreshold = itemCollectionThreshold
    return this.post('config', body)
  }

  /** POST /party-api/farming-mode - the account-wide farming strategy
   *  (Auto/Default/Scatter/Hunt); unlike nearly everything else in this
   *  client, this command takes no `character` field at all (confirmed
   *  against runtime/coordinator/http/hunt-mode.ts) - it's one shared
   *  value for the whole party. Hunt specifically requires a `backup`
   *  (monster focus + a real spawn location) the first time, or whenever
   *  changing it - the server 409s with `code:"backup_required"` if
   *  Hunt is requested without one and none is already set. */
  async setFarmingMode(mode: 'auto' | 'default' | 'scatter' | 'hunt', backup?: { monsterFocus: string[]; location: { map: string; x: number; y: number } }): Promise<ApiResult<CommandResult>> {
    return this.post('farming-mode', backup ? { mode, backup } : { mode })
  }

  /** POST /party-api/focus - which monsters a character farms/hunts,
   *  per-character (unlike farming-mode). Omitting `monsterSearchRadius`
   *  leaves it unchanged server-side. */
  async setFocus(character: string, monsterFocus: string[], monsterSearchRadius?: number): Promise<ApiResult<CommandResult>> {
    const body: Record<string, unknown> = { character, monsterFocus }
    if (monsterSearchRadius !== undefined) body.monsterSearchRadius = monsterSearchRadius
    return this.post('focus', body)
  }

  /** POST /party-api/hunt-blacklist - `action:"clear"` drops everything,
   *  `action:"remove"` drops one monster (needs `monsterId`), `action:
   *  "add"` manually blacklists one (needs `monsterId`). */
  async updateHuntBlacklist(action: 'add' | 'remove' | 'clear', monsterId?: string): Promise<ApiResult<CommandResult>> {
    const body: Record<string, unknown> = { action }
    if (monsterId !== undefined) body.monsterId = monsterId
    return this.post('hunt-blacklist', body)
  }

  /** POST /party-api/hunt-settings - a partial patch (only send the
   *  fields changing; server merges over the existing settings). */
  async saveHuntSettings(patch: Partial<{ relocateIfCompeting: boolean; blacklistDeaths: boolean; deathThreshold: number; blacklistExpirations: boolean; expirationThreshold: number }>): Promise<ApiResult<CommandResult>> {
    return this.post('hunt-settings', patch)
  }

  /** POST /party-api/merchant/bid - places or edits a standing "buy this
   *  item automatically, up to this price" order (wtborder-dialog.tsx).
   *  `minimumQuality` is the item's +level (only meaningful for
   *  upgradeable/compoundable items - the server itself zeroes it
   *  otherwise). `replaceStandEntry` answers a 409 "stand is full" retry
   *  by bouncing that occupant id - omit it on the first attempt. */
  async saveBid(
    itemId: string,
    price: number,
    quantity: number,
    minimumQuality: number,
    priorityOverride: number | null,
    useStandSlot: boolean,
    acceptHigherLevels: boolean,
    replaceStandEntry?: string,
  ): Promise<ApiResult<CommandResult>> {
    const body: Record<string, unknown> = { itemId, price, quantity, minimumQuality, useStandSlot, acceptHigherLevels }
    if (priorityOverride !== null) body.priorityOverride = priorityOverride
    if (replaceStandEntry !== undefined) body.replaceStandEntry = replaceStandEntry
    return this.post('merchant/bid', body)
  }

  /** POST /party-api/merchant/bid with `clear: true` - cancels a WTB order. */
  async cancelBid(itemId: string): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/bid', { itemId, clear: true })
  }

  /** `/party-api/command` type "upgrade-offering-rule" - creates (empty
   *  `id`) or edits (existing `id`) a standing "use this offering instead
   *  of scrolls during automatic upgrades in this level range" rule. The
   *  server assigns a real id for new rules; the id sent back in the
   *  response/next poll is authoritative, not whatever was sent. */
  async saveOfferingRule(character: string, id: string, name: string, floor: number, ceiling: number, offering: string, required: boolean): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(character, { type: 'upgrade-offering-rule', rule: { id, name, floor, ceiling, offering, required } })
  }

  /** `/party-api/command` type "upgrade-offering-rule" with remove. */
  async removeOfferingRule(character: string, id: string): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(character, { type: 'upgrade-offering-rule', rule: { id }, remove: true })
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

  /** POST /party-api/dashboard-preferences - "Send anniversary chat message
   *  when receiving cake from a kiss" (anniversary-dialog.tsx's autoChat toggle). */
  async setAnniversaryAutoChat(enabled: boolean): Promise<ApiResult<CommandResult>> {
    return this.post('dashboard-preferences', { anniversaryAutoChat: enabled })
  }

  /** POST /party-api/anniversary/chat-advertise - manually sends the
   *  server-generated cake-slice-trade advertisement to in-game chat right now. */
  async sendAnniversaryChatAdvertisement(): Promise<ApiResult<CommandResult>> {
    return this.post('anniversary/chat-advertise', {})
  }

  /** POST /party-api/aldata/key - generates a fresh ALData publishing key
   *  (replaces any existing one). */
  async generateAlDataKey(): Promise<ApiResult<string>> {
    return this.parseAlDataKeyResponse(await postJson(this.url('aldata/key'), {}))
  }

  /** GET /party-api/aldata/key - reveals the already-generated key. */
  async revealAlDataKey(): Promise<ApiResult<string>> {
    return this.parseAlDataKeyResponse(await getText(this.url('aldata/key')))
  }

  private parseAlDataKeyResponse(result: ApiResult<string>): ApiResult<string> {
    if (result.kind === 'failure') return result
    try {
      const parsed = JSON.parse(result.value) as { key?: string; error?: string }
      return typeof parsed.key === 'string' ? ok(parsed.key) : fail(parsed.error ?? 'ALData request failed')
    } catch {
      return fail('ALData request failed')
    }
  }

  /** GET /party-api/aldata/auth - checks whether ALData has confirmed the
   *  authentication mail yet ("NO" | "YES" | "CORRECT" | "WRONG"). */
  async checkAlDataAuth(): Promise<ApiResult<string>> {
    const result = await getText(this.url('aldata/auth'))
    if (result.kind === 'failure') return result
    try {
      const parsed = JSON.parse(result.value) as { auth?: string; error?: string }
      return typeof parsed.auth === 'string' ? ok(parsed.auth) : fail(parsed.error ?? 'ALData request failed')
    } catch {
      return fail('ALData request failed')
    }
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
