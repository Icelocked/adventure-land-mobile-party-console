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
