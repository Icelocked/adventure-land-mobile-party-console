import type { BankMark } from '@/models'

/** What (if anything) to overlay on one inventory slot's icon, ported
 *  from ui/itemicon/MarkBadge.kt: an "Auto X" pill for a rule-generated
 *  mark, "Mark for X" for a manual one-off mark. Merchant marks take
 *  visual priority when a slot somehow has both. */
export interface MarkBadgeInfo {
  label: string
  color: string
}

const BANK_COLOR = '#D9A441'
const MERCHANT_COLOR = '#9E7BFF'

export function markBadgeFor(slot: number, merchantMarks: BankMark[], bankMarks: BankMark[]): MarkBadgeInfo | null {
  const merchant = merchantMarks.find((mark) => mark.slot === slot)
  if (merchant) return { label: merchant.auto ? 'Auto merchant' : 'Mark for merchant', color: MERCHANT_COLOR }
  const bank = bankMarks.find((mark) => mark.slot === slot)
  if (bank) return { label: bank.auto ? 'Auto bank' : 'Mark for bank', color: BANK_COLOR }
  return null
}
