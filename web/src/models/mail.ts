import type { Item } from './item'

/** GET /party-api/mail. `count` is every known message, not an unread
 *  count: there is no read state, only `taken` (attachment collected). */
export interface MailSnapshot {
  messages: ReceivedMail[]
  count: number
  error?: string
  updatedAt?: number
}

export interface ReceivedMail {
  id?: string
  from?: string
  to?: string
  subject?: string
  message?: string
  sent?: string
  item?: Item
  // boolean | "pending" on the wire.
  taken?: unknown
  // A queued collection and why it failed, if it did.
  collection?: unknown
  collectionError?: string
}

/** GET /party-api/escape - progress of the party-wide emergency recovery.
 *  The server runs the whole sequence; this app shows `stage`/`error`. */
export interface EscapeStatus {
  id: string
  stage: string
  error: string | null
  progress: Record<string, { error?: string | null }>
}
