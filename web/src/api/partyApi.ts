import type { Item, MarketListing, RestockPolicy, StandListing } from '@/models'
import { apiBase, type ServerSettings } from '@/config/serverConfig'
import { beginActionToast, resolveActionToast } from '@/lib/actionToast'
import { PARTY_ACTION_EVENT, type PartyActionDetail } from '@/data/queryActions'

export interface CommandResult {
  ok: boolean
  error?: string
  // The whole parsed response - some routes return extra fields
  // (occupants, missing, deliveriesRemoved, ...).
  data?: Record<string, unknown>
}

/** Console: wtb-preferences.tsx WTBOptions. */
export type WtbOptions = {
  editField?: 'price' | 'quantity' | 'priorityOverride'
  value?: number | null
  bidRevision?: number
  preferencesOnly?: boolean
  useStandSlot?: boolean
  acceptHigherLevels?: boolean
  replaceStandEntry?: string
}

// `status` is only present when the server actually answered (even a
// 401/403); absent means no response at all (network error, timeout).
// PairingGate's checkPaired relies on that distinction. `code` and `body`
// carry a rejection's own fields, e.g. code
// "auto_bank_confirmation_required" or the `occupants` of a full stand.
export type ApiResult<T> =
  | { kind: 'success'; value: T }
  | { kind: 'failure'; message: string; status?: number; code?: string; body?: Record<string, unknown> }

const ok = <T>(value: T): ApiResult<T> => ({ kind: 'success', value })
const fail = <T = never>(message: string, status?: number, body?: Record<string, unknown>): ApiResult<T> => ({
  kind: 'failure',
  message,
  status,
  ...(body ? { body, code: typeof body.code === 'string' ? body.code : undefined } : {}),
})

// fetch() has no built-in timeout. A request that stalls after connecting
// (network hiccup, dropped Tailscale route) must fail so callers' retry
// logic gets a chance instead of hanging the UI.
const REQUEST_TIMEOUT_MS = 15_000
// state?section=core carries every character's farmingProfiles, including
// unrendered diagnostic history, and can exceed 1-2MB on a heavily
// automated account. On a slow connection 15s is not enough for it, so
// GETs get a longer allowance; POSTs should still fail fast.
const GET_TIMEOUT_MS = 45_000

async function timedFetch(url: string, init: RequestInit = {}, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // no-cache: never reuse a stored response without asking the server, but
    // let the browser revalidate if the console ever sends ETags (it currently
    // marks every response no-store, so each poll is a full download).
    return await fetch(url, { ...init, cache: 'no-cache', signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

/** Fired on window when a party-api request shows the browser's session is
 *  gone: a 401/403, or a redirect (the hosting gateway answers unpaired
 *  requests with 302 -> /setup). App.tsx renders the reconnect screen. */
export const AUTH_LOSS_EVENT = 'party-auth-loss'

function isAuthLoss(response: Response): boolean {
  return response.status === 401 || response.status === 403 || response.redirected
}

function signalAuthLoss(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_LOSS_EVENT))
}

async function getText(url: string, detectAuthLoss = false): Promise<ApiResult<string>> {
  try {
    const response = await timedFetch(url, {}, GET_TIMEOUT_MS)
    if (detectAuthLoss && isAuthLoss(response)) {
      signalAuthLoss()
      return fail('Session expired. Reconnect this browser.', 401)
    }
    const text = await response.text()
    return response.ok ? ok(text) : fail(`HTTP ${response.status}`, response.status)
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
    if (response.ok) return ok(text)
    // Many rejections carry an {error: "..."} body (e.g. pairing failures);
    // prefer it over the bare status.
    let message = `HTTP ${response.status}`
    try {
      const parsed = JSON.parse(text) as { error?: string }
      if (parsed.error) message = parsed.error
    } catch {
      // body wasn't JSON - keep the bare HTTP status message
    }
    return fail(message, response.status)
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
    const parsed = JSON.parse(text) as Record<string, unknown>
    return { ok: (parsed.ok as boolean | undefined) ?? true, error: parsed.error as string | undefined, data: parsed }
  } catch {
    return { ok: true }
  }
}

/** Carries this browser's saved launcher choices (set on the console's
 *  setup page) to the local launcher. Console: steam-client-setup.ts. */
function steamClientSetup(body: Record<string, unknown>): Record<string, unknown> {
  if (typeof localStorage === 'undefined') return body
  try {
    const setup = JSON.parse(localStorage.getItem('party-connection-setup') || 'null')
    return setup ? { ...body, clientSetup: { placement: setup.placement, client: setup.client } } : body
  } catch {
    return body
  }
}

/** Typed wrapper over the party-api REST surface. Command shapes follow
 *  the coordinator source; add a method per need rather than guessing. */
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

  /** GET against the party-api base for one-shot reads. Returns the raw
   *  body; callers decode it. */
  async get(path: string): Promise<ApiResult<string>> {
    return getText(this.url(path), true)
  }

  /** get() + JSON.parse, where an unparseable body (an HTML page from a
   *  proxy or captive portal) is a failure rather than a thrown
   *  SyntaxError that would kill the caller's poll loop. */
  async getJson<T>(path: string): Promise<ApiResult<T>> {
    const result = await this.get(path)
    if (result.kind === 'failure') return result
    try {
      return ok(JSON.parse(result.value) as T)
    } catch {
      return fail('Unexpected non-JSON response')
    }
  }

  async getRoot(path: string): Promise<ApiResult<string>> {
    return getText(this.rootUrl(path))
  }

  async postRoot(path: string, body: unknown): Promise<ApiResult<string>> {
    const toastId = beginActionToast()
    const result = await postJson(this.rootUrl(path), body)
    resolveActionToast(toastId, result.kind === 'success' ? 'sent' : 'failed', result.kind === 'failure' ? result.message : undefined)
    return result
  }

  /** Every mutating action funnels through here, so it is the one place
   *  that shows the "sent" acknowledgment (lib/actionToast.ts). On a slow
   *  connection a tap can take 10-15s to land, and without it nothing
   *  visibly happens in between. */
  async post(path: string, body: unknown): Promise<ApiResult<CommandResult>> {
    try {
      return await this.postOnce(path, body)
    } finally {
      // Refresh whatever the action touched, success or not.
      if (typeof window !== 'undefined')
        window.dispatchEvent(new CustomEvent<PartyActionDetail>(PARTY_ACTION_EVENT, { detail: { path: `/${path.replace(/^\/+/, '')}`, body } }))
    }
  }

  private async postOnce(path: string, body: unknown): Promise<ApiResult<CommandResult>> {
    const toastId = beginActionToast()
    // Parse the body as a CommandResult on failure too: the server sends
    // a real .error on many non-2xx responses (409 "backup_required",
    // "stand is full", validation errors). Fall back to the HTTP status
    // only when the body isn't parseable.
    try {
      const response = await timedFetch(this.url(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (isAuthLoss(response)) signalAuthLoss()
      const text = await response.text()
      if (!response.ok || response.redirected) {
        const parsed = parseCommandResult(text)
        const message = parsed.error ?? `HTTP ${response.status}`
        resolveActionToast(toastId, 'failed', message)
        return fail(message, response.status, parsed.data)
      }
      const parsed = parseCommandResult(text)
      resolveActionToast(toastId, parsed.ok === false ? 'failed' : 'sent', parsed.error)
      return ok(parsed)
    } catch (error) {
      const message = errorMessage(error)
      resolveActionToast(toastId, 'failed', message)
      return fail(message)
    }
  }

  /** POST /party-api/command - the general-purpose command endpoint. */
  async sendCommand(character: string, fields: Record<string, unknown>): Promise<ApiResult<CommandResult>> {
    return this.post('command', { character, ...fields })
  }

  /** Loads a roster member into an empty headless slot. */
  async spawnSlot(slot: number, character: string): Promise<ApiResult<CommandResult>> {
    return this.post(`slots/${slot}/spawn`, { character })
  }

  async logoutSlot(slot: number): Promise<ApiResult<CommandResult>> {
    return this.post(`slots/${slot}/logout`, {})
  }

  /** POST /steam/action - login (join Steam), primary (become/switch the
   *  Steam primary view), headless (leave Steam, keep running), logout. */
  async steamAction(character: string | null, action: 'login' | 'primary' | 'headless' | 'logout'): Promise<ApiResult<CommandResult>> {
    return this.post('steam/action', steamClientSetup({ character, action }))
  }

  /** POST /steam/recover - recover a failed Steam handoff once characters are offline. */
  async steamRecover(): Promise<ApiResult<CommandResult>> {
    return this.post('steam/recover', {})
  }

  /** POST /bankbois/create - provision a new bankboi storage worker; the
   *  response carries {bankboi: {name}}. */
  async createBankboi(): Promise<ApiResult<CommandResult>> {
    return this.post('bankbois/create', {})
  }

  /** POST /bankbois/:name/delete - only for an empty bankboi. */
  async deleteBankboi(name: string): Promise<ApiResult<CommandResult>> {
    return this.post(`bankbois/${encodeURIComponent(name)}/delete`, {})
  }

  /** POST /roster/create - create (and spawn) a new character. */
  async createCharacter(name: string, ctype: string, look: number): Promise<ApiResult<CommandResult>> {
    return this.post('roster/create', { name, class: ctype, look })
  }

  /** Returns the merchant to its home spot and home realm. */
  async goHome(character: string): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(character, { type: 'go-home' })
  }

  /** Item commands need the full item object, not just its name: the
   *  server verifies identity against it. `slot` is an inventory index for
   *  most actions, an equip-slot name (e.g. "mainhand") for unequip. */
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

  /** POST /party-api/formation {leader}. The server only touches `leader`
   *  when the key is present, so never combine this with a follow change. */
  async setLeader(leader: string): Promise<ApiResult<CommandResult>> {
    return this.post('formation', { leader })
  }

  /** POST /party-api/formation {character, follow}. */
  async setFollow(character: string, follow: boolean): Promise<ApiResult<CommandResult>> {
    return this.post('formation', { character, follow })
  }

  /** POST /party-api/formation {character, eventSelections}. */
  async setEventSelections(character: string, eventSelections: string[]): Promise<ApiResult<CommandResult>> {
    return this.post('formation', { character, eventSelections })
  }

  /** POST /party-api/restock - one character's HP/MP auto-potion policy,
   *  potion item included. */
  async saveRestock(character: string, policy: RestockPolicy): Promise<ApiResult<CommandResult>> {
    return this.post('restock', { character, hp: policy.hp, mp: policy.mp })
  }

  /** Command "withdraw" - pulls one item from bank `pack`/`slot` into a
   *  character's bag. */
  async withdrawFromBank(
    character: string,
    item: Item,
    pack: string,
    slot: number,
    markAll = false,
    removeAutoBankMark = false,
    upgradeTiers?: number,
  ): Promise<ApiResult<CommandResult>> {
    // removeAutoBankMark confirms dropping an automatic bank mark when the
    // server asks (auto_bank_confirmation_required). upgradeTiers is set
    // when the bank's "Mark for upgrade" withdraws the item to upgrade it.
    return this.post('command', { character, type: 'withdraw', pack, slot, item: { ...item }, markAll, ...(upgradeTiers ? { upgradeTiers } : {}), removeAutoBankMark })
  }

  /** POST /party-api/merchant/stand - list an item on the merchant's
   *  stand, or edit an existing listing in place by passing its `id`. */
  async markForStand(
    item: Item,
    slot: number | undefined,
    price: number,
    options: { bankPack?: string; quantity: number; markAll?: boolean; remove?: boolean; id?: string },
  ): Promise<ApiResult<CommandResult>> {
    // quantity is required: the server overwrites an existing listing's
    // quantity with it.
    const { bankPack, quantity, markAll = false, remove = false, id } = options
    return this.post('merchant/stand', { id, slot, item, bankPack, price, quantity, markAll, remove })
  }

  /** Sends the whole listing back so the server can find live and
   *  bank-sourced entries by id. */
  async removeStandListing(listing: StandListing): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/stand', { ...listing, remove: true })
  }

  /** POST /party-api/merchant/npc-sale. The server rejects source
   *  "character" for the merchant's own items ("Unknown player
   *  character"), so those use source "merchant". `acknowledged` confirms
   *  the modified-item warning; without it the server refuses to sell an
   *  upgraded/stat-scrolled/shiny item. */
  async markForNpcSale(
    character: string,
    item: Item,
    slot: number,
    options: { isMerchant: boolean; quantity: number; acknowledged: boolean },
  ): Promise<ApiResult<CommandResult>> {
    const { isMerchant, quantity, acknowledged } = options
    return this.post('merchant/npc-sale', {
      source: isMerchant ? 'merchant' : 'character',
      character: isMerchant ? undefined : character,
      slot,
      item,
      quantity,
      acknowledged,
    })
  }

  /** POST /party-api/merchant/npc-sale with source "bank" - sells a bank
   *  item directly without withdrawing it to a character first.
   *  `acknowledged` confirms the modified-item warning, same as above. */
  async sellBankItemToNpc(
    item: Item,
    pack: string,
    slot: number,
    options: { quantity: number; acknowledged: boolean },
  ): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/npc-sale', { source: 'bank', pack, slot, item, quantity: options.quantity, acknowledged: options.acknowledged })
  }

  /** POST /party-api/bank/unlock - queues a merchant errand to open one
   *  locked bank pack. `kind: 'key'` opens a floor's first (0-gold) vault
   *  with an owned key; 'gold' spends `vault.gold`. The server enforces
   *  ordering/ownership. */
  async unlockBankVault(pack: string, kind: 'key' | 'gold'): Promise<ApiResult<CommandResult>> {
    return this.post('bank/unlock', { pack, kind })
  }

  /** POST /party-api/deconstruction/mark with `pack` - marks a bank item
   *  for scrap without withdrawing it. `all` marks every matching item
   *  across all bank packs and BankBois. */
  async markBankItemForDeconstruction(item: Item, pack: string, slot: number, all = false): Promise<ApiResult<CommandResult>> {
    return this.post('deconstruction/mark', { item, pack, slot, all })
  }

  async markForDeconstruction(character: string, item: Item, slot: number, remove = false): Promise<ApiResult<CommandResult>> {
    return this.post('deconstruction/mark', { character, item, slot, remove })
  }

  /** Removes or retries a pending deconstruction mark by id, on its owner. */
  async removeDeconstructionMark(character: string, id: string, slot: number, item: Item): Promise<ApiResult<CommandResult>> {
    return this.post('deconstruction/mark', { character, slot, item, remove: true, id })
  }

  async retryDeconstructionMark(character: string, id: string): Promise<ApiResult<CommandResult>> {
    return this.post('deconstruction/mark', { character, id, retry: true })
  }

  /** Removes a manual NPC-sale mark by id. */
  async removeNpcSaleMark(character: string, id: string): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/npc-sale', { character, id, remove: true })
  }

  /** POST /party-api/deconstruction/auto - a standing "always
   *  deconstruct this item type" rule. */
  async autoDeconstruct(character: string, item: Item, remove = false): Promise<ApiResult<CommandResult>> {
    const body: Record<string, unknown> = { character, item }
    if (remove) body.remove = true
    return this.post('deconstruction/auto', body)
  }

  /** POST /party-api/merchant/auto-npc-sale - a standing "always sell
   *  this item type to an NPC" rule. */
  async autoNpcSale(character: string | undefined, item: Item, remove = false): Promise<ApiResult<CommandResult>> {
    // Omit `character` for the merchant (its rule is the account-wide
    // one); with it, the server stores a per-player rule that never fires
    // for the merchant.
    return this.post('merchant/auto-npc-sale', { item, character, action: remove ? 'remove' : 'set' })
  }

  /** POST /party-api/merchant/auto-stand - a standing "always list this
   *  item type on the stand at this price" rule, merchant-only. */
  async autoStand(item: Item, price: number, remove = false): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/auto-stand', { item, price, action: remove ? 'remove' : 'set' })
  }

  /** POST /party-api/merchant/auto-npc-sale action "clear-all" - drops
   *  every auto-NPC-sale rule scoped to `character`; undefined clears the
   *  merchant's account-wide rules. */
  async clearAllAutoNpcSales(character?: string): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/auto-npc-sale', { action: 'clear-all', character })
  }

  /** POST /party-api/merchant/auto-stand with action "clear-all" -
   *  merchant-only, account-wide (no character scoping server-side). */
  async clearAllAutoStand(): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/auto-stand', { action: 'clear-all' })
  }

  /** Commands "clear-auto-upgrades"/"clear-auto-compounds" drop every
   *  owner's rules at once; `character` must be the configured merchant. */
  async clearAutoUpgrades(merchantCharacter: string): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(merchantCharacter, { type: 'clear-auto-upgrades' })
  }
  async clearAutoCompounds(merchantCharacter: string): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(merchantCharacter, { type: 'clear-auto-compounds' })
  }

  /** Command "clear-auto-item-marks" - drops `character`'s own
   *  auto-bank/auto-merchant rules for the given mode. */
  async clearAutoItemMarks(character: string, mode: 'bank' | 'merchant'): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(character, { type: 'clear-auto-item-marks', mode })
  }

  /** POST /party-api/merchant/order - queues an NPC buy and/or crafting
   *  job. The server recomputes each buy's upgrade-attempt budget, so
   *  `level` is what matters; client-side cost estimates are display-only. */
  async submitMerchantOrder(
    buys: { id: string; quantity: number; level?: number; budget?: number; maxAttempts?: number }[],
    crafts: { id: string; quantity: number }[],
    removeAutoBankMark = false,
  ): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/order', { buys, crafts, removeAutoBankMark })
  }

  /** POST /party-api/merchant/exchange-order - NPC exchange/box operations. */
  async submitExchangeOrder(
    exchanges: { id: string; quantity: number; level?: number; reward?: string }[],
  ): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/exchange-order', { exchanges })
  }

  /** Command "character-travel" - sends one character to a map location. */
  async sendCharacterTo(character: string, map: string, x: number, y: number, label: string): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(character, { type: 'character-travel', location: { map, x, y }, label })
  }

  /** Command "return-leader". Requires a different, online leader. */
  async returnToLeader(character: string): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(character, { type: 'return-leader' })
  }

  /** POST /party-api/town-party - sends every active character to town. */
  async sendPartyToTown(): Promise<ApiResult<CommandResult>> {
    return this.post('town-party', {})
  }

  /** POST /party-api/escape - party-wide emergency recovery; needs one
   *  online warrior/mage/priest. Poll GET /party-api/escape
   *  (useEscapeStatus) for `stage`/`error`. */
  async triggerEscape(): Promise<ApiResult<CommandResult>> {
    return this.post('escape', {})
  }

  /** Command "remove-auto-item-mark" - removes one auto-bank/auto-merchant
   *  rule by key. No `item` needed for this type. */
  async removeAutoItemMark(character: string, mode: string, ruleKey: string): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(character, { type: 'remove-auto-item-mark', mode, ruleKey })
  }

  /** Command "update-auto-upgrade-rule" with remove. */
  async removeAutoUpgradeRule(owner: string, item: Item, ruleKey: string): Promise<ApiResult<CommandResult>> {
    return this.itemCommand('update-auto-upgrade-rule', owner, item, null, { ruleKey, remove: true })
  }

  /** Command "auto-compound-mark" (the rule's create command) with remove. */
  async removeAutoCompound(owner: string, name: string, targetTier: number): Promise<ApiResult<CommandResult>> {
    return this.itemCommand('auto-compound-mark', owner, { name }, null, { targetTier, remove: true })
  }

  /** POST /party-api/merchant/force-stand - pauses all merchant work to
   *  run the stand at home; disabling lets queued work resume. */
  async setForceStand(enabled: boolean): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/force-stand', { enabled })
  }

  /** POST /party-api/merchant/gather - toggles a gathering mode the
   *  merchant does between other jobs. */
  async setGathering(mode: 'mining' | 'fishing', enabled: boolean): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/gather', { mode, enabled })
  }

  /** POST /party-api/merchant/job/retry - clears a realm-blocked job's
   *  backoff so it runs again immediately. */
  async retryMerchantJob(id: string): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/job/retry', { id })
  }

  /** POST /party-api/merchant/clear - drops the entire merchant job queue
   *  and gathering modes. No server-side confirmation; callers confirm. */
  async clearMerchantQueue(): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/clear', {})
  }

  /** POST /party-api/merchant/donate - queues a gold donation; the
   *  response includes the XP it earns. */
  async donateGold(amount: number): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/donate', { amount })
  }

  /** POST /party-api/merchant/join-giveaway. The server normalizes
   *  `realm` ("US I" style input works). */
  async joinGiveaway(seller: string, realm: string): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/join-giveaway', { seller, realm })
  }

  /** POST /party-api/bank-party - the merchant collects gold/items from
   *  party members. Without `group` the server picks the only group, or
   *  409s with the group list when there are several. */
  async sendMerchantToParty(group?: string): Promise<ApiResult<CommandResult>> {
    return this.post('bank-party', group ? { group } : {})
  }

  /** POST /party-api/merchant/stale-orders/clear - recovery action that
   *  drops delivery/bank-mark records for items the merchant no longer has. */
  async clearStaleOrders(): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/stale-orders/clear', {})
  }

  /** POST /party-api/merchant/activity/clear. */
  async clearMerchantActivity(): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/activity/clear', {})
  }

  /** POST /party-api/merchant/routine-priorities. The server merges, so
   *  sending the full maps is always valid; `enabled` keys outside the
   *  automatic routines are ignored. */
  async saveRoutinePriorities(priorities: Record<string, number>, enabled: Record<string, boolean>): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/routine-priorities', { priorities, enabled })
  }

  /** POST /party-api/merchant/bank-sort - `mode: "automatic"` sorts every
   *  visit; `mode: "request"` only sorts when a one-time request is queued
   *  with `enabled: true`. */
  async setBankSortMode(mode: 'automatic' | 'request'): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/bank-sort', { mode })
  }
  async requestBankSort(enabled: boolean): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/bank-sort', { enabled })
  }

  /** POST /party-api/config - `threshold` is the gold carried before
   *  auto-banking; `itemCollectionThreshold` (1-42) is the marked-slot
   *  count before a collection trip queues. Omit whichever isn't changing. */
  async setThresholds(threshold?: number, itemCollectionThreshold?: number): Promise<ApiResult<CommandResult>> {
    const body: Record<string, unknown> = {}
    if (threshold !== undefined) body.threshold = threshold
    if (itemCollectionThreshold !== undefined) body.itemCollectionThreshold = itemCollectionThreshold
    return this.post('config', body)
  }

  /** POST /party-api/farming-mode. Always send `character`: the route
   *  wrapper uses it to scope the edit, and without it the server
   *  silently edits the account leader. A follower's change is saved as a
   *  preference rather than applied live. Hunt needs a `backup` (monster
   *  focus + spawn location) when none is set yet, or the server 409s. */
  async setFarmingMode(
    mode: 'auto' | 'default' | 'scatter' | 'hunt' | 'achievements',
    character: string,
    backup?: { monsterFocus: string[]; location: { map: string; x: number; y: number } },
  ): Promise<ApiResult<CommandResult>> {
    return this.post('farming-mode', backup ? { mode, character, backup } : { mode, character })
  }

  /** POST /party-api/focus - which monsters a character farms/hunts.
   *  Omitted priorities/radius are left unchanged server-side. */
  async setFocus(character: string, monsterFocus: string[], monsterSearchRadius?: number, monsterPriorities?: Record<string, number>): Promise<ApiResult<CommandResult>> {
    return this.post('focus', {
      character,
      monsterFocus,
      ...(monsterPriorities ? { monsterPriorities } : {}),
      ...(monsterSearchRadius !== undefined ? { monsterSearchRadius } : {}),
    })
  }

  /** POST /party-api/navigate-to-monster - sends the whole party to farm
   *  one monster now; needs an online leader. `phoenixRouteOrder` is
   *  required, and only valid, for "phoenix". */
  async navigateToMonster(
    monsterId: string,
    location: { map: string; x: number; y: number },
    phoenixRouteOrder?: string[],
  ): Promise<ApiResult<CommandResult>> {
    return this.post('navigate-to-monster', phoenixRouteOrder ? { monsterId, location, phoenixRouteOrder } : { monsterId, location })
  }

  /** Command "party-monster-travel" (leader) or "character-travel"
   *  (others) - routes one character to a farming area for its current
   *  monster focus. Console: use-party-console.tsx startFarmingArea. */
  async routeToFarmingArea(
    character: string,
    isLeader: boolean,
    location: { map: string; x: number; y: number },
    farmingMonsterIds: string[],
    label?: string,
  ): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(character, {
      type: isLeader ? 'party-monster-travel' : 'character-travel',
      location,
      farmingMonsterIds,
      ...(label ? { label } : {}),
    })
  }

  /** POST /party-api/hunt-blacklist - "add"/"remove" need `monsterId`,
   *  "clear" drops everything. */
  async updateHuntBlacklist(character: string, action: 'add' | 'remove' | 'clear', monsterId?: string): Promise<ApiResult<CommandResult>> {
    // Always scope to the character; without it the server edits the
    // leader's list.
    const body: Record<string, unknown> = { action, character }
    if (monsterId !== undefined) body.monsterId = monsterId
    return this.post('hunt-blacklist', body)
  }

  /** POST /party-api/achievement-hunt - one character's settings patch and/or
   *  blacklist change (console branch achievement-hunt). */
  async achievementHunt(
    character: string,
    body: {
      settings?: Partial<{ monsters: string[]; blacklistDeaths: boolean; deathThreshold: number; fillIdle: boolean }>
      blacklist?: { action: 'add' | 'remove' | 'clear'; monsterId?: string }
    },
  ): Promise<ApiResult<CommandResult>> {
    return this.post('achievement-hunt', { ...body, character })
  }

  /** POST /party-api/hunt-settings - a partial patch; the server merges. */
  async saveHuntSettings(
    character: string,
    patch: Partial<{ relocateIfCompeting: boolean; blacklistDeaths: boolean; deathThreshold: number; blacklistExpirations: boolean; expirationThreshold: number; preferredSpawns: Record<string, string> }>,
  ): Promise<ApiResult<CommandResult>> {
    return this.post('hunt-settings', { ...patch, character })
  }

  /** POST /party-api/rare-hunting - passive hunting rules and/or the
   *  party-wide field-generator toggle. */
  async setRareHunting(patch: { rules?: Record<string, Record<string, unknown>>; useFieldGenerators?: boolean }): Promise<ApiResult<CommandResult>> {
    return this.post('rare-hunting', patch)
  }

  /** POST /party-api/merchant/bid. priorityOverride is always sent (null
   *  clears it). A single-field edit passes editField + value +
   *  bidRevision so a stale edit is refused with 409. Cancel is
   *  clear: true with the bid's own values. */
  async saveBid(
    itemId: string,
    price: number,
    quantity: number,
    minimumQuality: number,
    clear: boolean,
    priorityOverride?: number | null,
    options?: WtbOptions,
  ): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/bid', { itemId, price, quantity, minimumQuality, clear, priorityOverride, ...options })
  }

  /** POST /party-api/upgrade-preview - polled, so a plain fetch with no
   *  action toast or refresh. `refresh` queues a new server preview;
   *  otherwise the stored one is returned. */
  async upgradePreview(body: Record<string, unknown>, signal?: AbortSignal): Promise<ApiResult<{ result?: unknown; status?: string; error?: string }>> {
    try {
      const response = await fetch(this.url('upgrade-preview'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })
      if (isAuthLoss(response)) {
        signalAuthLoss()
        return fail('Session expired. Reconnect this browser.', response.status)
      }
      const value = (await response.json().catch(() => ({}))) as { error?: string; result?: unknown; status?: string }
      if (!response.ok) return fail(value.error || 'Server preview unavailable', response.status)
      return ok(value)
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Server preview unavailable')
    }
  }

  /** Command "upgrade-offering-rule" - creates (empty `id`) or edits a
   *  rule to use an offering during automatic upgrades in a level range.
   *  The server assigns ids for new rules. */
  async saveOfferingRule(character: string, id: string, name: string, floor: number, ceiling: number, offering: string, required: boolean): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(character, { type: 'upgrade-offering-rule', rule: { id, name, floor, ceiling, offering, required } })
  }

  /** Command "upgrade-offering-rule" with remove. */
  async removeOfferingRule(character: string, id: string): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(character, { type: 'upgrade-offering-rule', rule: { id }, remove: true })
  }

  /** POST /party-api/realm/switch - moves every active character to
   *  another realm. Refused for PVP realms or while a switch/bankboi
   *  transaction is running. */
  async switchRealm(realm: string, setHome = false): Promise<ApiResult<CommandResult>> {
    return this.post('realm/switch', { realm, setHome })
  }

  /** POST /party-api/dashboard-preferences - the bankboi mule-character
   *  naming prefix. */
  async setBankboiPrefix(prefix: string): Promise<ApiResult<CommandResult>> {
    return this.post('dashboard-preferences', { bankboiPrefix: prefix })
  }

  /** POST /party-api/dashboard-preferences - send an anniversary chat
   *  message when receiving cake from a kiss. */
  async setAnniversaryAutoChat(enabled: boolean): Promise<ApiResult<CommandResult>> {
    return this.post('dashboard-preferences', { anniversaryAutoChat: enabled })
  }

  /** POST /party-api/anniversary/chat-advertise - posts the cake-slice
   *  trade advertisement to in-game chat now. */
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

  /** GET /party-api/dashboard-state - the import source paths and size limit. */
  async dashboardStateInfo(): Promise<ApiResult<string>> {
    return this.textWithError('GET', 'dashboard-state')
  }

  /** GET /party-api/dashboard-state/export - the settings JSON. */
  async dashboardStateExport(): Promise<ApiResult<string>> {
    return this.textWithError('GET', 'dashboard-state/export')
  }

  /** POST /party-api/dashboard-state/{preview,import} - the raw file as
   *  text/plain; an import repeats the preview's digest in X-State-Preview. */
  async dashboardStateRequest(action: 'preview' | 'import', source: string, digest?: string): Promise<ApiResult<string>> {
    return this.textWithError('POST', `dashboard-state/${action}`, source, { 'Content-Type': 'text/plain;charset=UTF-8', ...(digest ? { 'X-State-Preview': digest } : {}) })
  }

  /** A party-api request whose failures keep the server's {error} text or raw body. */
  private async textWithError(method: 'GET' | 'POST', path: string, body?: string, headers?: Record<string, string>): Promise<ApiResult<string>> {
    const toastId = method === 'POST' ? beginActionToast() : null
    try {
      const response = await timedFetch(this.url(path), method === 'POST' ? { method, headers, body } : {}, method === 'GET' ? GET_TIMEOUT_MS : 120_000) // state files can be large
      const text = await response.text()
      if (response.ok) {
        if (toastId !== null) resolveActionToast(toastId, 'sent')
        return ok(text)
      }
      let message = text
      try {
        message = (JSON.parse(text) as { error?: string }).error || text
      } catch {
        // Preserve non-JSON server errors.
      }
      message = message || `HTTP ${response.status} ${response.statusText}`
      if (toastId !== null) resolveActionToast(toastId, 'failed', message)
      return fail(message, response.status)
    } catch (error) {
      if (toastId !== null) resolveActionToast(toastId, 'failed', errorMessage(error))
      return fail(errorMessage(error))
    }
  }

  /** POST /console-update/{check,download,restart,preferences}. */
  async consoleUpdateAction(name: 'check' | 'download' | 'restart' | 'preferences', value: Record<string, unknown> = {}): Promise<ApiResult<string>> {
    return this.postRoot(`console-update/${name}`, value)
  }

  /** GET /console-debug and POST /console-debug/{start,stop}. */
  async consoleDebug(): Promise<ApiResult<string>> {
    return this.getRoot('console-debug')
  }
  async consoleDebugAction(name: 'start' | 'stop'): Promise<ApiResult<string>> {
    return this.postRoot(`console-debug/${name}`, {})
  }

  /** GET /party-api/aldata/auth - whether ALData has confirmed the
   *  authentication mail ("NO" | "YES" | "CORRECT" | "WRONG"). */
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

  /** POST /party-api/merchant/send-mail. Server validation: recipient
   *  ^[A-Za-z0-9_]{1,40}$, subject 1-74 chars, message <=1000 chars. */
  async sendMail(mail: { recipient: string; subject: string; message: string; quantity: number; source?: { pack: string; slot: number; item: Item } }): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/send-mail', mail)
  }

  /** POST /party-api/mail/{refresh,collect,delete} {id}. */
  async mailAction(action: 'refresh' | 'collect' | 'delete', id?: string): Promise<ApiResult<CommandResult>> {
    return this.post(`mail/${action}`, { id })
  }

  /** POST /party-api/mail/collect - collects a message's attachment. */
  async collectMail(id: string): Promise<ApiResult<CommandResult>> {
    return this.post('mail/collect', { id })
  }

  /** POST /party-api/merchant/aldata-order - buys from one ALData
   *  listing, sent as received minus client-only fields. The listing must
   *  still exist and be under 120s old. */
  async buyAlData(listing: MarketListing | Record<string, unknown>, buyQuantity: number): Promise<ApiResult<CommandResult>> {
    const { origin: _origin, groupedListings: _grouped, ...wire } = listing as Record<string, unknown>
    return this.post('merchant/aldata-order', { listing: wire, buyQuantity })
  }

  /** POST /party-api/combat-log/:character/clear. */
  async clearCombatLog(character: string): Promise<ApiResult<CommandResult>> {
    return this.post(`combat-log/${encodeURIComponent(character)}/clear`, {})
  }

  /** POST /party-api/merchant/aldata-sale - sells owned copies into a
   *  live ALData buy order. */
  async sellAlData(order: Record<string, unknown>, sellQuantity: number): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/aldata-sale', { order, sellQuantity })
  }

  /** POST /party-api/merchant/ponty-order - `keys` lets the server
   *  combine several Ponty listings into one purchase. */
  async buyPonty(listing: { key?: string; keys?: string[]; quantity: number; unitPrice?: number }): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/ponty-order', { keys: listing.keys || [listing.key], quantity: listing.quantity, unitPrice: listing.unitPrice })
  }
}
