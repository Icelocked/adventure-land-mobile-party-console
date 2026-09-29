import { sameMarkedItem } from '@/models'
import type { BankMark, CompoundGroup, DeconstructionMark, Item, NpcSaleMark, StatScrollMark, UpgradeMark } from '@/models'

/** What (if anything) to overlay on one inventory slot's icon, ported
 *  from ui/itemicon/MarkBadge.kt: an "Auto X" pill for a rule-generated
 *  mark, "Mark for X" for a manual one-off mark. Priority order mirrors
 *  item-action-banner.ts's real priority table: deconstruction, NPC sale,
 *  stat scroll, upgrade, and compound marks all outrank delivery, which
 *  in turn outranks a bank/merchant hold there - merchant still beats
 *  bank when both are somehow set, an existing decision this doesn't
 *  change. */
export interface MarkBadgeInfo {
  label: string
  color: string
}

const BANK_COLOR = '#D9A441'
const MERCHANT_COLOR = '#9E7BFF'
const STAT_COLOR = '#38BDF8'
const UPGRADE_COLOR = '#A78BFA'
const COMPOUND_COLOR = '#E879F9'
const NPC_COLOR = '#FB7185'
const DECONSTRUCTION_COLOR = '#FB923C'
const DELIVERY_COLOR = '#60A5FA'

function upgradeLabel(mark: UpgradeMark): string {
  const start = Number(mark.item.level ?? 0)
  const target = start + Number(mark.tiers || 1)
  return mark.auto ? `Auto → +${target}` : `+${start} → +${target}`
}

/** `item` is whatever is ACTUALLY in this slot right now (or null/undefined
 *  for an empty slot) - every mark lookup below requires both the slot
 *  number AND the mark's own item to match it, so a stale mark left over
 *  from before the item moved/was consumed never badges an empty slot or
 *  the unrelated item that now occupies its old slot number. */
export function markBadgeFor(
  slot: number | string,
  item: Item | null | undefined,
  merchantMarks: BankMark[],
  bankMarks: BankMark[],
  statScrollMarks: StatScrollMark[] = [],
  upgradeMarks: UpgradeMark[] = [],
  compoundGroups: CompoundGroup[] = [],
  npcSaleMarks: NpcSaleMark[] = [],
  deconstructionMarks: DeconstructionMark[] = [],
  deliveries: { target: string; slot: number; item: Item }[] = [],
): MarkBadgeInfo | null {
  if (!item) return null
  const at = (markSlot: number | string | undefined, markItem: Item) => markSlot === slot && sameMarkedItem(markItem, item)

  const deconstruction = deconstructionMarks.find((mark) => mark.state !== 'complete' && at(mark.slot, mark.item))
  if (deconstruction) return { label: deconstruction.auto ? 'Auto deconstruction' : 'Deconstruction', color: DECONSTRUCTION_COLOR }
  const npcSale = npcSaleMarks.find((mark) => at(mark.slot, mark.item))
  if (npcSale) return { label: npcSale.auto ? 'Auto NPC sale' : 'NPC sale', color: NPC_COLOR }
  const stat = statScrollMarks.find((mark) => at(mark.slot, mark.item))
  if (stat) return { label: `Stat scroll → ${stat.statType.toUpperCase()}`, color: STAT_COLOR }
  const upgrade = upgradeMarks.find((mark) => at(mark.slot, mark.item))
  if (upgrade) return { label: upgradeLabel(upgrade), color: UPGRADE_COLOR }
  const compound = compoundGroups.flatMap((group) => group.items).find((mark) => at(mark.slot, mark.item))
  if (compound) {
    const level = Number(compound.item.level ?? 0)
    return { label: `+${level} → +${level + 1}`, color: COMPOUND_COLOR }
  }
  const delivery = deliveries.find((entry) => at(entry.slot, entry.item))
  if (delivery) return { label: `To ${delivery.target}`, color: DELIVERY_COLOR }
  const merchant = merchantMarks.find((mark) => at(mark.slot, mark.item))
  if (merchant) return { label: merchant.auto ? 'Auto merchant' : 'Mark for merchant', color: MERCHANT_COLOR }
  const bank = bankMarks.find((mark) => at(mark.slot, mark.item))
  if (bank) return { label: bank.auto ? 'Auto bank' : 'Mark for bank', color: BANK_COLOR }
  return null
}
