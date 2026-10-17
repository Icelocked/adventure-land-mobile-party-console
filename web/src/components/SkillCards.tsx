import { GameBox, GameLine, GameText } from '@/components/GameBox'
import { SKILL_EXTRA_COLORS, skillCardLines, skillExtras } from '@/lib/skillCardLines'
import type { SkillEntry } from '@/models'

// The skill card and its extras box, shared by the Skills screen and item details.
// Console: dashboard/features/party/skill-card.tsx SkillCards.
export function SkillCards({ skill, skillName }: { skill: SkillEntry; skillName: (id: string) => string | undefined }) {
  const definition = skill.definition || {}
  const lines = skillCardLines(definition, skillName)
  const extras = skillExtras(definition)
  return (
    <div className="flex min-w-0 flex-wrap items-start gap-3">
      {!!lines.length && (
        <GameBox label="Skill card" className="min-w-[min(100%,14rem)] flex-1">
          {lines.map((line) =>
            'text' in line ? <GameText key={line.key} line={line.key} text={line.text} color={line.color} /> : <GameLine key={line.key} line={line.key} label={line.label} value={line.value} color={line.color} />,
          )}
        </GameBox>
      )}
      {!!extras.length && (
        <GameBox label="Skill extras" className="min-w-[min(100%,14rem)] flex-1">
          {extras.map(([key, label, value]) => (
            <GameLine key={key} line={key} label={label} value={value} color={SKILL_EXTRA_COLORS[key] || '#C3C3C3'} />
          ))}
        </GameBox>
      )}
    </div>
  )
}
