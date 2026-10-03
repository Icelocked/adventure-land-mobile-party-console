import type { SkillEntry } from '@/models'

/** skill-range-label.tsx, verbatim. */
export function skillRangeLabel(skill: SkillEntry): string {
  const definition = skill.definition || {}
  if (definition.global) return 'Global'
  const fixedRange = typeof definition.range === 'number' && Number.isFinite(definition.range)
  const usesCharacterRange = !!definition.use_range || !!definition.target
  if (!fixedRange && !usesCharacterRange) return 'Not specified'
  const multiplier = typeof definition.range_multiplier === 'number' ? definition.range_multiplier : 1
  const bonus = typeof definition.range_bonus === 'number' ? definition.range_bonus : 0
  let label = fixedRange ? `${Number(definition.range) * multiplier + bonus}` : `${multiplier !== 1 ? `${multiplier} × ` : ''}attack range${bonus ? ` ${bonus > 0 ? '+' : '−'} ${Math.abs(bonus)}` : ''}`
  if (skill.id === 'throw') label += ' + character level'
  return label
}
