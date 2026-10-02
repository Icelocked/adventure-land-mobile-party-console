import type { Item, MarketListing, RestockPolicy, StandListing, StandSearchListing } from '@/models'
import { apiBase, type ServerSettings } from '@/config/serverConfig'
import { beginActionToast, resolveActionToast } from '@/lib/actionToast'
import { PARTY_ACTION_EVENT, type PartyActionDetail } from '@/data/queryActions'

export interface CommandResult {
  ok: boolean
  error?: string
  // The whole parsed response - routes return extra fields the dashboard
  // reads (occupants, missing, deliveriesRemoved, ...).
  data?: Record<string, unknown>
}

// `status` is only present when the server actually answered (a real
// HTTP response, even a 401/403) - absent means the request never got a
// response at all (network error, timeout, connection blocked). Callers
// that need to tell "the server said no" apart from "I couldn't reach
// the server" - see PairingGate's checkPaired - rely on this distinction.
// `code` and `body` carry a rejection's own fields (query-actions.ts
// PartyActionError.details) - e.g. code "auto_bank_confirmation_required",
// or the `occupants` of a full stand.
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

// Bounded like the Android app's REST client (15s) - a request that
// stalls after connecting (a network hiccup, a dropped Tailscale route)
// must actually fail so callers' own retry logic gets a chance, instead
// of hanging the UI forever with nothing to time it out. fetch() has no
// built-in timeout, unlike OkHttp, so this is done via AbortController.
const REQUEST_TIMEOUT_MS = 15_000
// state?section=core carries every character's farmingProfiles, and
// a long-played/heavily-automated account's accumulated hunt-cycle/
// convoy diagnostic history (routeRecovery attempt logs, eventTrips,
// combatRecovery revisions - none of it rendered, all of it round-
// tripped every poll) can push that single response past 1-2MB. On a
// slow connection (confirmed against a live account: the tiny `escape`
// endpoint alone took 8+ seconds of pure round-trip latency) the 15s
// cap was hitting on every single poll for this one request - timing
// out consistently, silently, before farmingPolicy/leader/monsterFocus
// ever arrived, while every smaller request (bank/market/mail/escape)
// kept succeeding fine. That looked exactly like "the UI never updates
// no matter how long you wait or refresh" because it effectively never
// did. GETs (state fetches) get a longer allowance than POSTs
// (mutating commands, which should still fail fast if truly stuck).
const GET_TIMEOUT_MS = 45_000

async function timedFetch(url: string, init: RequestInit = {}, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // party-console's own /party-api/* middleware (http/middleware.ts's
    // partyApiResponseHeaders) sets CORS headers but no Cache-Control at
    // all - unlike codeResponseHeaders, which explicitly no-stores the
    // CODE editor endpoint. Every poll hits the exact same URL+querystring
    // (state?section=core&dashboard=1), and fetch()'s default cache mode
    // consults the browser's own HTTP cache using heuristics when a
    // response carries no explicit cache directives - a real risk of
    // silently serving a stale snapshot forever on a connection/browser
    // combination that decides to cache it, with no way for this app to
    // tell from the outside (the request still resolves fast and 200s).
    // Forcing no-store here is enough on its own; it doesn't depend on
    // the server ever sending matching headers.
    return await fetch(url, { ...init, cache: 'no-store', signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

/** Fired on window when a party-api request shows the browser's session is
 *  gone - query-cache.tsx's authenticationLost(): a 401/403, or a redirect
 *  (the hosting gateway answers unpaired requests with 302 -> /setup,
 *  tools/hosting/authorize.ts). App.tsx renders the reconnect screen. */
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
    // The server sends a real {error: "..."} body on plenty of rejections
    // (see authorize.ts's "Dashboard origin required", setup-routes.ts's
    // pairing failures) - a bare "HTTP 403" was silently replacing that
    // with no way for a caller to ever show the actual reason.
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

/** Thin wrapper over the party-api REST surface, porting network/
 *  PartyApiClient.kt 1:1 - every command shape here was verified against
 *  the real coordinator source this project's whole way through; add a
 *  typed method here as each new screen needs one rather than guessing. */
/** steam-client-setup.ts, verbatim: carry this browser's saved launcher
 *  choices (set on the console's setup page) to the local launcher. */
function steamClientSetup(body: Record<string, unknown>): Record<string, unknown> {
  if (typeof localStorage === 'undefined') return body
  try {
    const setup = JSON.parse(localStorage.getItem('party-connection-setup') || 'null')
    return setup ? { ...body, clientSetup: { placement: setup.placement, client: setup.client } } : body
  } catch {
    return body
  }
}

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

  /** Every mutating action in the app funnels through this one method, so
   *  it's the single instrumentation point for "did my tap register" -
   *  see lib/actionToast.ts. On a slow/lossy connection a tap could take
   *  10-15 seconds to actually reach the server with zero visible change
   *  in between, which reads as "the app is broken" rather than "the
   *  network is slow" - this gives an immediate, guaranteed acknowledgment
   *  the moment the request is actually dispatched, independent of how
   *  long the round trip itself ends up taking. */
  async post(path: string, body: unknown): Promise<ApiResult<CommandResult>> {
    try {
      return await this.postOnce(path, body)
    } finally {
      // query-actions.ts: refresh whatever the action touched, success or not.
      if (typeof window !== 'undefined')
        window.dispatchEvent(new CustomEvent<PartyActionDetail>(PARTY_ACTION_EVENT, { detail: { path: `/${path.replace(/^\/+/, '')}`, body } }))
    }
  }

  private async postOnce(path: string, body: unknown): Promise<ApiResult<CommandResult>> {
    const toastId = beginActionToast()
    // Reads the body itself rather than going through postJson/getText,
    // which discard the response body on any non-2xx status - the server
    // sends a real CommandResult (with a real .error message) on plenty of
    // failures too (409 "backup_required", "stand is full", validation
    // errors, ...), and postJson's HTTP-status-only failure was silently
    // replacing all of that with a bare "HTTP 409". Matches the Kotlin
    // app's PartyApiClient.post() exactly: parse the body as a
    // CommandResult on both success AND failure, falling back to the raw
    // HTTP status only when the body isn't parseable as one.
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

  /** `/party-api/command` - the general-purpose command endpoint:
   *  character name plus whatever domain-specific fields that command
   *  needs. */
  async sendCommand(character: string, fields: Record<string, unknown>): Promise<ApiResult<CommandResult>> {
    return this.post('command', { character, ...fields })
  }

  /** use-party-console.tsx spawn (headless): load a roster member into an empty slot. */
  async spawnSlot(slot: number, character: string): Promise<ApiResult<CommandResult>> {
    return this.post(`slots/${slot}/spawn`, { character })
  }

  /** use-party-console.tsx logout (headless slot). */
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

  /** inventory-panel.tsx's merchant "Go home": returns the merchant to its
   *  home spot and the home realm (manual-commands.ts goHome). */
  async goHome(character: string): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(character, { type: 'go-home' })
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

  /** POST /party-api/formation {leader} - mirrors party-workspace.tsx's
   *  leader RadioGroup. The server only touches `leader` when the key is
   *  present (formation.ts), so this must never be sent with a follow
   *  change. */
  async setLeader(leader: string): Promise<ApiResult<CommandResult>> {
    return this.post('formation', { leader })
  }

  /** POST /party-api/formation {character, follow} - mirrors
   *  connected-character-card.tsx's Follow checkbox. */
  async setFollow(character: string, follow: boolean): Promise<ApiResult<CommandResult>> {
    return this.post('formation', { character, follow })
  }

  /** POST /party-api/restock - one character's HP/MP auto-potion
   *  thresholds. */
  async saveRestock(character: string, policy: RestockPolicy): Promise<ApiResult<CommandResult>> {
    // use-party-console.tsx saveRestock: the whole policy, potion item included.
    return this.post('restock', { character, hp: policy.hp, mp: policy.mp })
  }

  /** `/party-api/command` type "withdraw" - pulls one item out of the
   *  shared bank to a character's own bag. `pack` is the bank pack name,
   *  `slot` is that pack's slot index. */
  async withdrawFromBank(
    character: string,
    item: Item,
    pack: string,
    slot: number,
    markAll = false,
    removeAutoBankMark = false,
    upgradeTiers?: number,
  ): Promise<ApiResult<CommandResult>> {
    // bank-withdrawal.tsx: {character, type:'withdraw', pack, slot, item,
    // markAll, removeAutoBankMark} - the last confirms dropping an
    // automatic bank mark when the server asks (auto_bank_confirmation_required).
    // upgradeTiers: bank "Mark for upgrade" withdraws the item to upgrade it (party-inventory-panels.tsx onBankUpgrade).
    return this.post('command', { character, type: 'withdraw', pack, slot, item: { ...item }, markAll, ...(upgradeTiers ? { upgradeTiers } : {}), removeAutoBankMark })
  }

  /** POST /party-api/merchant/stand - list an inventory item on the
   *  merchant's stand, or edit an existing listing in place by passing its
   *  `id` (stand-marks.ts's update() finds the existing mark by id/pack/
   *  slot/item and reuses the same slot rather than creating a new one). */
  async markForStand(
    item: Item,
    slot: number | undefined,
    price: number,
    options: { bankPack?: string; quantity: number; markAll?: boolean; remove?: boolean; id?: string },
  ): Promise<ApiResult<CommandResult>> {
    // use-party-console.tsx saveStandListing - quantity is required: the
    // server overwrites an existing listing's quantity with it.
    const { bankPack, quantity, markAll = false, remove = false, id } = options
    return this.post('merchant/stand', { id, slot, item, bankPack, price, quantity, markAll, remove })
  }

  /** use-party-console.tsx removeStandListing: the whole listing back, so
   *  the server can find live and bank-sourced entries by id. */
  async removeStandListing(listing: StandListing): Promise<ApiResult<CommandResult>> {
    return this.post('merchant/stand', { ...listing, remove: true })
  }

  /** POST /party-api/merchant/npc-sale from the item-action panel - source
   *  is "character" for anyone else, but the server rejects that source
   *  for the merchant's OWN items ("Unknown player character": npc-sale.ts's
   *  validate() specifically refuses `character === merchantCharacter`) -
   *  the merchant's own inventory has to use source "merchant" instead,
   *  same as the auto-NPC-sale reconciliation does (bank-side NPC sales
   *  are the bank screen's own source "bank" concern). `acknowledged`
   *  confirms the modified-item warning (isModifiedItem) - the server
   *  otherwise refuses to sell an upgraded/stat-scrolled/shiny item at all. */
  async markForNpcSale(
    character: string,
    item: Item,
    slot: number,
    options: { isMerchant: boolean; quantity: number; acknowledged: boolean },
  ): Promise<ApiResult<CommandResult>> {
    // use-party-console.tsx confirmNpcSale.
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
    // use-party-console.tsx confirmNpcSale (bank source).
    return this.post('merchant/npc-sale', { source: 'bank', pack, slot, item, quantity: options.quantity, acknowledged: options.acknowledged })
  }

  /** POST /party-api/bank/unlock (http/bank-unlock.ts) - queues a merchant
   *  errand to open one locked bank pack. `kind: 'key'` unlocks a floor's
   *  first (0-gold) vault using an owned key item; omitted, it spends
   *  `vault.gold` to open an already-accessible vault. The server enforces
   *  ordering/ownership and returns a specific error otherwise. */
  async unlockBankVault(pack: string, kind: 'key' | 'gold'): Promise<ApiResult<CommandResult>> {
    // party-inventory-panels.tsx onUnlock: {pack, kind}.
    return this.post('bank/unlock', { pack, kind })
  }

  /** POST /party-api/deconstruction/mark, triggered by `pack` being
   *  present - marks a bank item for scrap without withdrawing it first.
   *  `all` marks every matching item across every bank pack/BankBoi, not
   *  just this one slot (bank-deconstruction.ts's matchingTargets). */
  async markBankItemForDeconstruction(item: Item, pack: string, slot: number, all = false): Promise<ApiResult<CommandResult>> {
    return this.post('deconstruction/mark', { item, pack, slot, all })
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
  async autoNpcSale(character: string | undefined, item: Item, remove = false): Promise<ApiResult<CommandResult>> {
    // connected-inventory.tsx: `character` is omitted for the configured
    // merchant (its rule is the account-wide one); with it, the server
    // stores a per-player rule that never fires for the merchant.
    return this.post('merchant/auto-npc-sale', { item, character, action: remove ? 'remove' : 'set' })
  }

  /** POST /party-api/merchant/auto-stand - a standing "always list this
   *  item type on the stand at this price" rule, merchant-only. */
  async autoStand(item: Item, price: number, remove = false): Promise<ApiResult<CommandResult>> {
    // use-party-console.tsx saveStandListing (auto): no character - the rule is the merchant's.
    return this.post('merchant/auto-stand', { item, price, action: remove ? 'remove' : 'set' })
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

  /** POST /party-api/farming-mode - sets a character's farming strategy
   *  (Auto/Default/Scatter/Hunt). `character` matters a lot more than it
   *  looks: hunt-mode.ts's own handler never reads it, but the ROUTE
   *  WRAPPER around it does (http/farming-scope.ts's
   *  createScopedFarmingRoute, reading `body.character` to pick which
   *  character's scoped state view the handler actually edits) - omit it
   *  and the server silently defaults to the ACCOUNT LEADER instead of
   *  the character you think you're changing (confirmed against
   *  application.ts's `ports.mainOwner` wiring). A character following
   *  the leader gets redirected server-side to a "saved for later"
   *  preference instead of a live change (createSavedFarmingModeRoute) -
   *  matches party-console's own setFarmingPolicy exactly. Hunt
   *  specifically requires a `backup` (monster focus + a real spawn
   *  location) the first time, or whenever changing it - the server
   *  409s if Hunt is requested without one and none is already set. */
  async setFarmingMode(
    mode: 'auto' | 'default' | 'scatter' | 'hunt',
    character: string,
    backup?: { monsterFocus: string[]; location: { map: string; x: number; y: number } },
  ): Promise<ApiResult<CommandResult>> {
    return this.post('farming-mode', backup ? { mode, character, backup } : { mode, character })
  }

  /** POST /party-api/focus - which monsters a character farms/hunts,
   *  per-character (unlike farming-mode). Omitting `monsterSearchRadius`
   *  leaves it unchanged server-side. */
  async setFocus(character: string, monsterFocus: string[], monsterSearchRadius?: number): Promise<ApiResult<CommandResult>> {
    const body: Record<string, unknown> = { character, monsterFocus }
    if (monsterSearchRadius !== undefined) body.monsterSearchRadius = monsterSearchRadius
    return this.post('focus', body)
  }

  /** POST /party-api/navigate-to-monster - sends the whole party/convoy to
   *  go find and farm a specific monster right now (requires an online
   *  leader; party-wide, not per-character - matches party-console's own
   *  monster-route-button.tsx flow, triggered from the bestiary/monster
   *  list, not the per-character Monster focus form). `phoenixRouteOrder`
   *  is required (and only valid) when `monsterId === "phoenix"`. */
  async navigateToMonster(
    monsterId: string,
    location: { map: string; x: number; y: number },
    phoenixRouteOrder?: string[],
  ): Promise<ApiResult<CommandResult>> {
    return this.post('navigate-to-monster', phoenixRouteOrder ? { monsterId, location, phoenixRouteOrder } : { monsterId, location })
  }

  /** POST /party-api/command, type "party-monster-travel" (leader) or
   *  "character-travel" (anyone else) - routes ONE character to a chosen
   *  farming area for their own current monster focus. Matches
   *  use-party-console.tsx's startFarmingArea for the farmAreaRequest
   *  (non-Hunt, per-character "find my monsters" via the route-button)
   *  case - distinct from navigateToMonster, which moves the whole party
   *  convoy to one specific monster instead. */
  async routeToFarmingArea(
    character: string,
    isLeader: boolean,
    location: { map: string; x: number; y: number },
    farmingMonsterIds: string[],
  ): Promise<ApiResult<CommandResult>> {
    return this.sendCommand(character, {
      type: isLeader ? 'party-monster-travel' : 'character-travel',
      location,
      farmingMonsterIds,
    })
  }

  /** POST /party-api/hunt-blacklist - `action:"clear"` drops everything,
   *  `action:"remove"` drops one monster (needs `monsterId`), `action:
   *  "add"` manually blacklists one (needs `monsterId`). */
  async updateHuntBlacklist(character: string, action: 'add' | 'remove' | 'clear', monsterId?: string): Promise<ApiResult<CommandResult>> {
    // connected-character-card.tsx always scopes to the character; without
    // it the server edits the leader's list (farming-scope.ts).
    const body: Record<string, unknown> = { action, character }
    if (monsterId !== undefined) body.monsterId = monsterId
    return this.post('hunt-blacklist', body)
  }

  /** POST /party-api/hunt-settings - a partial patch (only send the
   *  fields changing; server merges over the existing settings). */
  async saveHuntSettings(character: string, patch: Partial<{ relocateIfCompeting: boolean; blacklistDeaths: boolean; deathThreshold: number; blacklistExpirations: boolean; expirationThreshold: number }>): Promise<ApiResult<CommandResult>> {
    return this.post('hunt-settings', { ...patch, character })
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
    // use-party-console.tsx saveStandBid: priorityOverride is always sent -
    // null clears it (merchant-bid.ts keeps the old value when it's absent).
    return this.post('merchant/bid', { itemId, price, quantity, minimumQuality, clear: false, priorityOverride, useStandSlot, acceptHigherLevels, replaceStandEntry })
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
  async sendMail(mail: { recipient: string; subject: string; message: string; quantity: number; source?: { pack: string; slot: number; item: Item } }): Promise<ApiResult<CommandResult>> {
    // send-mail-dialog.tsx onSend body, verbatim.
    return this.post('merchant/send-mail', mail)
  }

  /** POST /mail/refresh|collect|delete {id} - send-mail-dialog.tsx mailAction. */
  async mailAction(action: 'refresh' | 'collect' | 'delete', id?: string): Promise<ApiResult<CommandResult>> {
    return this.post(`mail/${action}`, { id })
  }

  /** POST /party-api/mail/collect - collects an attached item/gold from a
   *  received message by its id. */
  async collectMail(id: string): Promise<ApiResult<CommandResult>> {
    return this.post('mail/collect', { id })
  }

  /** POST /party-api/merchant/aldata-order - buys from one ALData public
   *  listing. Server only reads the listing's `key` plus the desired
   *  quantity; it must still exist and be fresh (<120s old). */
  async buyAlData(listing: MarketListing, buyQuantity: number): Promise<ApiResult<CommandResult>> {
    // use-party-console.tsx buyALDataListing: the listing as received.
    const { origin: _origin, ...wire } = listing
    return this.post('merchant/aldata-order', { listing: wire, buyQuantity })
  }

  /** POST /party-api/merchant/ponty-order - `keys` lets the server
   *  combine several Ponty listings into one purchase; this app always
   *  buys a single listing. */
  async buyPonty(listing: MarketListing): Promise<ApiResult<CommandResult>> {
    // use-party-console.tsx buyPontyListing: the whole listing.
    return this.post('merchant/ponty-order', { keys: listing.keys || [listing.key], quantity: listing.quantity, unitPrice: listing.unitPrice })
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
