// Pure detection logic for the push notifier - no I/O, unit-tested from the
// PWA's vitest suite (src/lib/notifierDetect.test.ts).

/** Every alert a device can switch on, grouped for the app's Settings. */
export const ALERTS = ['stuck', 'idle', 'deaths', 'errors', 'inventory', 'bank', 'rules', 'orders', 'events', 'rare', 'trading', 'mail']
/** Character-health alerts still arrive during a device's quiet hours. */
export const URGENT_ALERTS = ['stuck', 'idle', 'deaths', 'errors']

/** Account-wide limits, adjustable in the app. */
export const DEFAULT_SETTINGS = {
  stuckMinutes: 2,
  idleMinutes: 5,
  errors: { count: 5, minutes: 10 },
  deaths: { count: 3, minutes: 30 },
  // mode: 'chance' (drop chance under 1 in N), 'value' (worth at least N gold), or 'both'.
  rare: { mode: 'chance', chanceOneIn: 10000, minGold: 1000000 },
}

/** Clamp a settings patch onto the current settings. */
export function mergeSettings(current, patch = {}) {
  const positive = (value, fallback, max = 1e9) => (Number.isFinite(Number(value)) && Number(value) >= 1 ? Math.min(max, Math.floor(Number(value))) : fallback)
  const base = { ...DEFAULT_SETTINGS, ...current }
  return {
    stuckMinutes: positive(patch.stuckMinutes, base.stuckMinutes, 1440),
    idleMinutes: positive(patch.idleMinutes, base.idleMinutes, 1440),
    errors: { count: positive(patch.errors?.count, base.errors.count, 1000), minutes: positive(patch.errors?.minutes, base.errors.minutes, 1440) },
    deaths: { count: positive(patch.deaths?.count, base.deaths.count, 1000), minutes: positive(patch.deaths?.minutes, base.deaths.minutes, 1440) },
    rare: {
      mode: ['chance', 'value', 'both'].includes(patch.rare?.mode) ? patch.rare.mode : base.rare.mode,
      chanceOneIn: positive(patch.rare?.chanceOneIn, base.rare.chanceOneIn),
      minGold: positive(patch.rare?.minGold, base.rare.minGold, 1e13),
    },
  }
}

/** pending-character-cards.tsx labels for the connection states worth a push. */
const CONNECTION_PROBLEMS = { lost: 'Connection lost', stopped: 'CODE stopped' }

/** The party's live (non-bankboi) characters from a core snapshot, in slot order. */
export function liveCharacters(core) {
  const bankbois = new Set((core.bankbois || []).map((entry) => entry.name))
  const fromSlots = (core.activeSlots || []).map((slot) => slot.character).filter(Boolean)
  const names = fromSlots.length ? fromSlots : Object.keys(core.characterDetails || {})
  return [...new Set(names)].filter((name) => !bankbois.has(name))
}

/** Problems right now, per character: a lost/stopped connection, or no
 *  status report (diagnostics seenAt, server clock) for `stuckAfterMs`. */
export function characterProblems(core, now, stuckAfterMs) {
  const problems = {}
  const connections = new Map((core.characterConnections || []).map((entry) => [entry.name, entry.status]))
  for (const name of liveCharacters(core)) {
    const status = connections.get(name)
    if (CONNECTION_PROBLEMS[status]) {
      problems[name] = CONNECTION_PROBLEMS[status]
      continue
    }
    const seenAt = Number(core.characterDetails?.[name]?.seenAt) || 0
    if (seenAt && now - seenAt >= stuckAfterMs) problems[name] = `No update for ${Math.floor((now - seenAt) / 60000)} min — may be hung`
  }
  return problems
}

/** Transitions between two problem maps: new or changed problems, and recoveries. */
export function problemTransitions(previous, current) {
  const events = []
  // A stuck character's minute count keeps growing; only the kind of problem is a change.
  const kind = (text) => (text?.startsWith('No update') ? 'stuck' : text)
  for (const [name, problem] of Object.entries(current)) {
    if (!previous[name] || kind(previous[name]) !== kind(problem)) events.push({ name, problem })
  }
  for (const name of Object.keys(previous)) if (!current[name]) events.push({ name, problem: null })
  return events
}

/** runtime/game-log-filters.ts classifyGameLog's error rule. */
const GAME_LOG_ERROR = /\b\w*error\b|\bexception\b|\bfailed\b|route rejected|collisions detected|falling back to native|\b(?:line|column)\s*:?\s*\d+/i
export const isGameLogError = (message) => GAME_LOG_ERROR.test(String(message || ''))

/** Error timestamps per character: game-log errors, plus the merchant's error-level activity. */
export function errorTimes(gameLogs, merchantActivity, merchantName) {
  const times = {}
  for (const [name, entries] of Object.entries(gameLogs || {}))
    for (const entry of entries || []) if (isGameLogError(entry.message)) (times[name] ||= []).push(Number(entry.at))
  if (merchantName) for (const entry of merchantActivity || []) if (entry.level === 'error') (times[merchantName] ||= []).push(Number(entry.at))
  return times
}

/** Death timestamps per character from the combat logs. */
export function deathTimes(combatLogs) {
  const times = {}
  for (const [name, entries] of Object.entries(combatLogs || {})) for (const entry of entries || []) if (entry.type === 'death') (times[name] ||= []).push(Number(entry.at))
  return times
}

/** Characters with at least `count` events in the last `windowMs`, counting only events
 *  after their previous alert so one burst alerts once. Returns {name: count}. */
export function bursts(times, now, count, windowMs, lastAlertAt = {}) {
  const hits = {}
  for (const [name, list] of Object.entries(times)) {
    const since = Math.max(now - windowMs, Number(lastAlertAt[name]) || 0)
    const recent = list.filter((at) => at > since && at <= now).length
    if (recent >= count) hits[name] = recent
  }
  return hits
}

/** Latest activity per character: newest combat or game log entry, or a position change. */
export function activityTimes(previous, combatLogs, gameLogs, positions, previousPositions, now) {
  const result = { ...previous }
  const bump = (name, at) => {
    if (Number(at) > (result[name] || 0)) result[name] = Number(at)
  }
  for (const [name, entries] of Object.entries(combatLogs || {})) for (const entry of entries || []) bump(name, entry.at)
  for (const [name, entries] of Object.entries(gameLogs || {})) for (const entry of entries || []) bump(name, entry.at)
  for (const [name, position] of Object.entries(positions || {})) {
    const before = previousPositions?.[name]
    if (!before || before.map !== position.map || Math.hypot((position.x || 0) - (before.x || 0), (position.y || 0) - (before.y || 0)) > 5) bump(name, now)
  }
  return result
}

/** Characters idle for `idleMs` (not the merchant, who legitimately stands still). */
export function idleCharacters(activity, names, merchantName, now, idleMs) {
  return names.filter((name) => name !== merchantName && activity[name] && now - activity[name] >= idleMs)
}

/** auto-upgrade / auto-compound rules whose remaining count reached zero. */
export function completedRules(previous, config) {
  const done = []
  const upgradeQuantity = (rule) => (rule && typeof rule === 'object' && Number.isSafeInteger(Number(rule.quantity)) ? Number(rule.quantity) : -1)
  for (const [owner, rules] of Object.entries(config.autoUpgradeMarks || {}))
    for (const [key, rule] of Object.entries(rules || {})) {
      const before = upgradeQuantity(previous.autoUpgradeMarks?.[owner]?.[key])
      if (before > 0 && upgradeQuantity(rule) === 0) {
        const [name, level] = key.split('@+')
        const tiers = Number(rule.tiers) || 0
        done.push({ kind: 'upgrade', title: 'Auto-upgrade rule done', body: `${name} reached +${Number(level || 0) + tiers}` })
      }
    }
  for (const [owner, rules] of Object.entries(config.autoCompounds || {}))
    for (const rule of rules || []) {
      const before = (previous.autoCompounds?.[owner] || []).find((entry) => entry.name === rule.name)
      if (before && Number(before.quantity) > 0 && Number(rule.quantity) === 0)
        done.push({ kind: 'compound', title: 'Auto-compound rule done', body: `${rule.name} reached +${rule.targetTier}` })
    }
  return done
}

/** Merchant buy orders with an upgrade target (merchant-order.ts) that left the queue. */
export function finishedUpgradeOrders(previousQueue, queue) {
  const remaining = new Set((queue || []).map((job) => job.id))
  const finished = []
  for (const job of previousQueue || []) {
    if (remaining.has(job.id)) continue
    for (const buy of job.order?.buys || [])
      if (Number(buy.level) > 0) finished.push({ title: 'Buy-and-upgrade order finished', body: `${buy.quantity} × ${buy.id} to +${buy.level}` })
  }
  return finished
}

/** The event ids any character has selected (event-policy.ts selectedEvents, unioned). */
export function selectedEventIds(config) {
  const supported = ['anniversary', 'abtesting', 'goobrawl', 'crabxx', 'franky', 'icegolem', 'snowman']
  const ids = new Set()
  for (const list of Object.values(config.eventSelectionsByCharacter || {})) for (const id of list || []) ids.add(id)
  for (const [, enabled] of Object.entries(config.eventsByCharacter || {})) if (enabled) supported.forEach((id) => ids.add(id))
  return ids
}

/** Selected events that were live and no longer are. */
export function endedEvents(previousSchedules, schedules, selected) {
  const live = new Set((schedules || []).filter((event) => event.live).map((event) => event.id))
  return (previousSchedules || []).filter((event) => event.live && !live.has(event.id) && selected.has(event.id))
}

/** Index of item id → name, base value and best (highest) drop chance from the catalog. */
export function rareIndex(allItems) {
  const index = {}
  for (const item of allItems || []) {
    const drops = item.meta?.world?.drops || []
    const best = drops.reduce((max, drop) => Math.max(max, Number(drop.rate) || 0), 0)
    index[item.id] = { name: item.name || item.id, gold: Number(item.meta?.definition?.g) || 0, chance: best > 0 ? best : null }
  }
  return index
}

/** Whether a looted item counts as rare under the account's rule. */
export function isRareDrop(info, rare) {
  if (!info) return false
  const byChance = info.chance !== null && info.chance < 1 / rare.chanceOneIn
  const byValue = info.gold >= rare.minGold
  return rare.mode === 'both' ? byChance && byValue : rare.mode === 'value' ? byValue : byChance
}

/** merchant-activity entries worth a trading push: stand sales, WTB fills,
 *  Ponty/ALData/player purchases (runtime merchant-observation.ts, bids.ts,
 *  marketplace-progress.ts wording) and other completed sales. */
export function tradeNotice(entry) {
  const message = String(entry?.message || '')
  if (entry?.level === 'error') return null
  if (/^Sold .+ at stand/.test(message)) return { title: 'Stand sale', body: message }
  if (/^WTB filled for /.test(message)) return { title: 'WTB order filled', body: message }
  if (/^Bought /.test(message)) return { title: 'Purchase completed', body: message }
  if (entry?.level === 'success' && /\bsold\b/i.test(message)) return { title: 'Sale completed', body: message }
  return null
}

/** Entries newer than `since` (the latest `at` already handled). */
export function newEntries(entries, since) {
  return (entries || []).filter((entry) => Number(entry.at) > since).sort((a, b) => a.at - b.at)
}

/** Mail ids not seen before. */
export function newMail(messages, seenIds) {
  return (messages || []).filter((message) => message?.id && !seenIds.has(String(message.id)))
}

/** Whether `date` falls in a device's quiet hours ("HH:MM" local to the device's offset). */
export function inQuietHours(quiet, date) {
  if (!quiet?.start || !quiet?.end) return false
  const minutes = (text) => {
    const [h, m] = String(text).split(':').map(Number)
    return (h % 24) * 60 + (m || 0)
  }
  const local = (date.getUTCHours() * 60 + date.getUTCMinutes() - (Number(quiet.offsetMinutes) || 0) + 1440 * 2) % 1440
  const start = minutes(quiet.start),
    end = minutes(quiet.end)
  return start <= end ? local >= start && local < end : local >= start || local < end
}

/** Characters whose bag is full: every slot up to the reported inventory
 *  size is taken (section=inventory sends the bag with empty slots as null;
 *  section=fast carries inventorySize). */
export function fullInventories(inventory, fast, names) {
  const full = []
  for (const name of names) {
    const items = inventory?.[name]?.items
    if (!Array.isArray(items)) continue
    const size = Number(fast?.[name]?.inventorySize) || items.length
    if (size > 0 && items.slice(0, size).filter(Boolean).length >= size) full.push(name)
  }
  return full
}

/** Free slots across every unlocked bank pack, or null before the bank has
 *  been seen (section=bank's bank.packs, each pack a fixed list). */
export function bankFreeSlots(bank) {
  const packs = bank?.packs
  if (!packs || typeof packs !== 'object' || !Object.keys(packs).length) return null
  let free = 0
  for (const pack of Object.values(packs)) if (Array.isArray(pack)) free += pack.filter((entry) => !entry).length
  return free
}

/** Names in `current` that weren't in `previous`, so a fill alerts once. */
export const newlyAdded = (previous, current) => current.filter((name) => !previous.includes(name))

/** Which devices get an alert: switched on, not muted for the character, and not in quiet hours unless urgent. */
export function recipients(devices, alert, character, date) {
  return devices.filter(
    (device) =>
      (device.alerts || []).includes(alert) &&
      !(character && (device.muted || []).includes(character)) &&
      !(!URGENT_ALERTS.includes(alert) && inQuietHours(device.quiet, date)),
  )
}
