import { automaticCommerceRuleKey, type Item, type PartyStateDynamic } from '@/models'
import { itemActionBanner, type ItemActionBanner } from './itemActionBanner'
import { upgradeRuleTiers } from './itemFormulas'

export type BankItemRules = Pick<
  PartyStateDynamic,
  'merchantCharacter' | 'merchantRules' | 'autoItemMarks' | 'autoNpcSales' | 'autoStandMarks' | 'autoUpgradeMarks' | 'autoCompounds' | 'autoDeconstruction' | 'autoExchanges'
>

/** The one banner a bank item shows for the automatic rules that match it,
 *  plus its manual NPC sale mark. With shared rules only the merchant's own
 *  per-character rules count; otherwise any character's rule does.
 *  Console: bank-item-banner.tsx. */
export function bankItemBanner(item: Item, rules: BankItemRules, manualNpc = false): ItemActionBanner | null {
  const level = Number(item.level) || 0
  const key = automaticCommerceRuleKey(item)
  const upgradeKey = `${item.name}@+${level}`
  const owners = <T,>(maps: Record<string, T> | undefined): T[] =>
    rules.merchantRules ? (maps?.[String(rules.merchantCharacter)] ? [maps[String(rules.merchantCharacter)]] : []) : Object.values(maps || {})
  const bank = owners(rules.autoItemMarks).some((marks) => (marks[upgradeKey] || (level === 0 ? marks[item.name] : undefined)) === 'bank')
  const upgrades = owners(rules.autoUpgradeMarks)
    .map((marks) => marks[upgradeKey])
    .filter((rule) => !!rule && (typeof rule !== 'object' || (rule as { quantity?: number }).quantity !== 0))
  const tiers = Math.max(0, ...upgrades.map(upgradeRuleTiers))
  const compound = owners(rules.autoCompounds)
    .flat()
    .filter((rule) => rule.name === item.name && rule.quantity !== 0 && rule.targetTier > level)
    .sort((a, b) => b.targetTier - a.targetTier)[0]
  return itemActionBanner(
    [
      manualNpc && { action: 'npc', label: 'NPC sale' },
      !!rules.autoNpcSales?.[key] && { action: 'npc', automatic: true, label: 'Auto NPC' },
      owners(rules.autoDeconstruction).some((marks) => !!marks[key]) && { action: 'deconstruction', automatic: true, label: 'Auto deconstruction' },
      !!rules.autoStandMarks?.[key] && { action: 'stand', automatic: true, label: 'Auto stand' },
      tiers > 0 && { action: 'upgrade', automatic: true, label: `Auto upgrade → +${level + tiers}` },
      !!compound && { action: 'compound', automatic: true, label: `Auto compound → +${compound.targetTier}` },
      !!rules.autoExchanges?.[`${item.name}@${level}`] && { action: 'exchange', automatic: true, label: 'Auto exchange' },
      bank && { action: 'bank', automatic: true, label: 'Auto bank' },
    ],
    false,
  )
}
