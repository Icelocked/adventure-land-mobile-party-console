// The Diagnostics button's wire (console runtime/status/coordinator/routes.ts, status/api.ts) and the
// words diagnostics-dialog.tsx draws it with.

/** One alert: a saved snapshot, by its subject (a character or a group), what set it off and when. */
export interface DiagnosticsAlert {
  id: string
  subject: string
  trigger: string
  at: number
}

// Core's `recordSaved`: the last record a ring saved (status/coordinator/diagnostics.ts `lastSaved`).
export interface RecordSaved {
  at: number
  ring: string
  character: string
  record: string
}

export interface DiagnosticsLeadUp {
  seq?: number
  at?: number
  part?: string
  decision: string
  kind?: string
  owner?: string
  tier?: string
  code?: string
  cause?: string
  skill?: string
  reason?: string
  by?: { kind?: string; owner?: string; site?: string }
}
export interface DiagnosticsIncident {
  id: string
  kind: string
  character?: string
  owner?: string
  activity?: string
  rung?: string
  trying?: string
  noProgressMs?: number
  position?: { map?: string; x?: number; y?: number }
  blocked?: { code?: string; kind?: string; owner?: string; by?: { kind?: string; owner?: string } }
  error?: string
  leadUp?: DiagnosticsLeadUp[]
}
/** GET /diagnostics/alert?subject=&id=: the snapshot's facts and the routine records before it. */
export interface DiagnosticsReport {
  id: string
  character: string
  trigger: string
  at: number
  records: DiagnosticsLeadUp[]
  incidents: DiagnosticsIncident[]
}
/** GET /diagnostics/records?character=&rings=: each named ring's last post, or null before one. */
export interface DiagnosticsRecordsReply {
  live: Record<string, { at: number; records: unknown; incidents?: unknown[] } | null>
}

// Table G's rings (console runtime/status/rules.ts TABLE_G) in diagnostics-dialog.tsx's words.
export const DIAGNOSTICS_RINGS = [
  { ring: 'movement', label: 'Movement' },
  { ring: 'turns', label: 'Turns' },
  { ring: 'targeting', label: 'Targeting' },
  { ring: 'survival', label: 'Survival' },
  { ring: 'calls', label: 'Call budget' },
  { ring: 'merchant', label: 'Merchant' },
  { ring: 'combat', label: 'Combat trace' },
] as const

// Each snapshot trigger in the player's words (runtime/movement/coordinator/records.ts SNAPSHOT_TRIGGERS).
export const ALERT_LABELS: Record<string, string> = {
  death: 'Death', stuck: 'Stuck', 'caught-error': 'Caught error', churn: 'Churn', 'walk-failed': 'Walk failed',
  'task-failed': 'Task failed', 'safe-point': 'Fell back to a safe point', limitdc: 'Call limit disconnect', refused: 'Refused',
}

/** A ring the records route takes: table G's, or an add-on's `<add-on>.<key>`. */
export const isLeasedRing = (ring: string) => DIAGNOSTICS_RINGS.some((row) => row.ring === ring) || ring.includes('.')

/** Saved read marks as alert ids. Anything but a string list reads as no marks, so a stray value
 *  under the key never breaks the view. */
export function parseReadMarks(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

/** The marks after marking `ids` read; a mark stays only while its alert is still saved
 *  (diagnostics-dialog.tsx `markRead`). */
export function markAlertsRead(marks: readonly string[], ids: readonly string[], alerts: readonly DiagnosticsAlert[]): string[] {
  const saved = new Set(alerts.map((alert) => alert.id))
  return [...new Set([...marks, ...ids])].filter((id) => saved.has(id))
}

/** A ring read that threw on the character arrives as a `read-failed` incident with no id or lead-up
 *  (runtime/status/character/rings.ts `reply`). */
export function ringReadFailures(incidents: readonly unknown[] | undefined): string[] {
  return (incidents ?? [])
    .filter((incident) => (incident as { kind?: string } | null)?.kind === 'read-failed')
    .map((incident) => String((incident as { error?: unknown }).error ?? ''))
}
