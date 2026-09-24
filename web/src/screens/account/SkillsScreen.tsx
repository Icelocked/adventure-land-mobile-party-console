import { useState } from 'react'
import { useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'
import type { SkillClass, SkillEntry } from '@/models'

/** Skill reference by class - ported from ui/account/SkillsScreen.kt.
 *  Tap a class to expand its skills, each showing its real definition
 *  (range, mp cost, cooldown, explanation) instead of just a name list. */
export function SkillsScreen() {
  const dynamicState = useDynamicState()
  const refreshNow = useRefreshDynamicStateNow()
  const [expandedClass, setExpandedClass] = useState<string | null>(null)

  return (
    <AccountScreenScaffold title="Skills" onRefresh={() => void refreshNow()}>
      {dynamicState.skillCatalog.length === 0 ? (
        <EmptyState message="No skill data yet." />
      ) : (
        <div className="flex flex-col gap-1.5 p-3">
          {dynamicState.skillCatalog.map((cls) => (
            <ClassSkillsCard key={cls.id} classSkills={cls} expanded={expandedClass === cls.id} onToggle={() => setExpandedClass(expandedClass === cls.id ? null : cls.id)} />
          ))}
        </div>
      )}
    </AccountScreenScaffold>
  )
}

function ClassSkillsCard({ classSkills, expanded, onToggle }: { classSkills: SkillClass; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <button className="w-full text-left" onClick={onToggle}>
        <div className="text-sm font-medium">{classSkills.name}</div>
        {!expanded && <div className="text-xs text-muted-foreground">{classSkills.skills.map((s) => s.name).join(', ')}</div>}
      </button>
      {expanded && (
        <div className="mt-2 flex flex-col gap-2">
          {classSkills.skills.map((skill) => (
            <SkillRow key={skill.id} skill={skill} />
          ))}
        </div>
      )}
    </div>
  )
}

function SkillRow({ skill }: { skill: SkillEntry }) {
  const def = skill.definition
  const detailParts: string[] = []
  if (def?.range != null) detailParts.push(`Range ${def.range}`)
  if (def?.mp != null) detailParts.push(`MP ${def.mp}`)
  if (def?.cooldown != null) detailParts.push(`CD ${def.cooldown / 1000}s`)

  return (
    <div>
      <div className="text-sm">{skill.name}</div>
      {def?.explanation && <p className="text-xs text-muted-foreground">{def.explanation}</p>}
      {detailParts.length > 0 && <p className="text-xs text-muted-foreground">{detailParts.join(' · ')}</p>}
    </div>
  )
}
