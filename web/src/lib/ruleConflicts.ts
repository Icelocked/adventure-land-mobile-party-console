import { automaticCommerceRuleKey, type Item, type PartyStateDynamic } from '@/models'

/** Marks are partial identities; a changing stack quantity doesn't count. */
const transientProperties = new Set(['q', 'price', 'rid', 'b', 'giveaway'])
function sameIdentity(first: Item | null | undefined, second: Item | null | undefined): boolean {
  if (!first || !second) return false
  return Object.keys(second)
    .filter((key) => !transientProperties.has(key))
    .every((key) => JSON.stringify(first[key as keyof Item]) === JSON.stringify(second[key as keyof Item]))
}

const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {})

/** Console: runtime/coordinator/inventory/shared-rules.ts itemRuleConflicts. */
function ruleOwner(state: PartyStateDynamic, name: string): string {
  return state.merchantRules?.version === 1 ? String(state.merchantCharacter) : name
}
function unfinishedUpgrade(mark: Record<string, unknown>, original: Record<string, unknown>, item: Item): boolean {
  const start = Number(original.level) || 0,
    level = Number(item.level) || 0
  return !!mark.passId && level >= start && level < start + Number(mark.tiers) && sameIdentity({ ...item, level: start }, { ...(original as unknown as Item), level: start })
}
function offeringUpgradePending(state: PartyStateDynamic, item: Item): boolean {
  return Object.values(state.upgrades || {})
    .flatMap((marks) => marks || [])
    .some((raw) => {
      const mark = record(raw),
        waiting = record(mark.waitingOffering),
        original = record(mark.item)
      return !!mark.auto && original.name === item.name && (waiting.level === Number(item.level || 0) || unfinishedUpgrade(mark, original, item))
    })
}
function activeUpgrade(value: unknown): boolean {
  if (!value) return false
  return typeof value !== 'object' || Number((value as { quantity?: number }).quantity) !== 0
}
function processingPending(state: PartyStateDynamic, item: Item): boolean {
  const owner = ruleOwner(state, String(state.merchantCharacter))
  return (
    offeringUpgradePending(state, item) ||
    activeUpgrade(state.autoUpgradeMarks?.[owner]?.[`${item.name}@+${Number(item.level || 0)}`]) ||
    !!state.autoCompounds?.[owner]?.some((rule) => rule.name === item.name && Number(rule.quantity) !== 0 && Number(item.level || 0) < Number(rule.targetTier || 1))
  )
}
export function itemRuleConflicts(state: PartyStateDynamic, item: Item): string[] {
  if (!state.merchantRules) return []
  const owner = String(state.merchantCharacter),
    key = automaticCommerceRuleKey(item)
  const actions: string[] = []
  if (processingPending(state, item)) actions.push('Processing')
  if (state.autoNpcSales?.[key]) actions.push('NPC sale')
  if (state.autoStandMarks?.[key]) actions.push('Stand sale')
  if (state.autoDeconstruction?.[owner]?.[key]) actions.push('Deconstruction')
  return actions.length > 1 ? actions : []
}

export function conflictingItems(state: PartyStateDynamic) {
  const owner = String(state.merchantCharacter)
  const rules = [...Object.values(state.autoNpcSales || {}), ...Object.values(state.autoStandMarks || {}), ...Object.values(state.autoDeconstruction?.[owner] || {})]
  const items = new Map<string, Item>()
  for (const rule of rules) items.set(`${rule.item.name}:${rule.item.level || 0}`, rule.item)
  return [...items.values()].map((item) => ({ item, actions: itemRuleConflicts(state, item) })).filter((row) => row.actions.length)
}

export function describeRule(value: unknown): string {
  if (!value || typeof value !== 'object') return String(value)
  const rule = value as { tiers?: number; targetTier?: number; quantity?: number; price?: number }
  if (rule.tiers) return `${rule.tiers} upgrade levels · ${rule.quantity === -1 || rule.quantity === undefined ? 'Unlimited' : `${rule.quantity} remaining`}`
  if (rule.targetTier) return `Compound to +${rule.targetTier} · ${rule.quantity === -1 || rule.quantity === undefined ? 'Unlimited' : `${rule.quantity} remaining`}`
  if (rule.price) return `${rule.price.toLocaleString()}g`
  return 'Automatic rule'
}
