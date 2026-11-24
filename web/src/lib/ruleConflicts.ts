import type { Item, PartyStateDynamic } from '@/models'

/** Core's rows of items with more than one automatic rule; the console builds them
 *  (items/rules.ts incompatibleRuleRows) and the dashboard draws them as sent
 *  (shared-rule-conflicts.tsx). */
export function conflictingItems(state: Pick<PartyStateDynamic, 'incompatibleRules'>): { item: Item; actions: string[] }[] {
  return state.incompatibleRules ?? []
}

export function describeRule(value: unknown): string {
  if (!value || typeof value !== 'object') return String(value)
  const rule = value as { tiers?: number; targetTier?: number; quantity?: number; price?: number }
  if (rule.tiers) return `${rule.tiers} upgrade levels · ${rule.quantity === -1 || rule.quantity === undefined ? 'Unlimited' : `${rule.quantity} remaining`}`
  if (rule.targetTier) return `Compound to +${rule.targetTier} · ${rule.quantity === -1 || rule.quantity === undefined ? 'Unlimited' : `${rule.quantity} remaining`}`
  if (rule.price) return `${rule.price.toLocaleString()}g`
  return 'Automatic rule'
}
