// Pure detection logic for the push notifier - no I/O, unit-tested from the
// PWA's vitest suite (src/lib/notifierDetect.test.ts).

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
  for (const [name, problem] of Object.entries(current)) {
    // A stuck character's minute count keeps growing; only the kind of problem is a change.
    const kind = (text) => (text?.startsWith('No update') ? 'stuck' : text)
    if (!previous[name] || kind(previous[name]) !== kind(problem)) events.push({ name, problem })
  }
  for (const name of Object.keys(previous)) if (!current[name]) events.push({ name, problem: null })
  return events
}

/** merchant-activity entries worth a push: stand sales, WTB fills, purchases
 *  (runtime merchant-observation.ts / bids.ts / marketplace-progress.ts
 *  wording) and anything logged as an error. */
export function merchantNotice(entry) {
  const message = String(entry?.message || '')
  if (entry?.level === 'error') return { title: 'Merchant problem', body: message }
  if (/^Sold .+ at stand/.test(message)) return { title: 'Stand sale', body: message }
  if (/^WTB filled for /.test(message)) return { title: 'WTB order filled', body: message }
  if (/^Bought /.test(message)) return { title: 'Merchant purchase', body: message }
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
