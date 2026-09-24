import type { Item } from './item'

/** Mirrors model/Mail.kt - GET /party-api/mail (mail-inbox.tsx /
 *  mail-query.ts), a separate route from /party-api/state. `count` is
 *  every known message, not an "unread" count - the wire protocol has no
 *  read/unread distinction, only `taken` (collected an attachment). */
export interface MailSnapshot {
  messages: ReceivedMail[]
  count: number
}

export interface ReceivedMail {
  id?: string
  from?: string
  to?: string
  subject?: string
  message?: string
  sent?: string
  item?: Item
  // boolean | "pending" on the wire - kept untyped so a non-boolean value
  // never fails the whole message's parse.
  taken?: unknown
}

/** escape-status.tsx's shape for GET/POST /party-api/escape - the party-wide
 *  emergency-recovery command (needs one online warrior/mage/priest; the server
 *  owns the whole staged rendezvous/convoy-fallback sequence, this app only
 *  triggers it and shows `stage`/`error`). */
export interface EscapeStatus {
  id: string
  stage: string
  error: string | null
  progress: Record<string, { error?: string | null }>
}
