import { useState } from 'react'
import { useDynamicState, usePartyApi } from '@/data/PartyDataProvider'
import { conflictingItems, describeRule } from '@/lib/ruleConflicts'
import { Button } from '@/components/ui/button'
import { SectionCard } from '../SectionCard'

/** With shared merchant rules, members' rules
 *  that disagree are paused until one owner's value is chosen; rules that
 *  would both act on the same item (NPC sale / stand / deconstruction /
 *  processing) are flagged too. Shown on the merchant only. */
export function RuleConflictsSection() {
  const api = usePartyApi()
  const state = useDynamicState()
  const [error, setError] = useState<string | null>(null)
  const conflicts = (state.merchantRules?.conflicts ?? []) as { id: string; family: string; key: string; choices: { owner: string; value: unknown }[] }[]
  const incompatible = conflictingItems(state)
  if (!conflicts.length && !incompatible.length) return null
  return (
    <SectionCard title="Automatic rules awaiting a choice">
      {conflicts.map((conflict) => (
        <div key={conflict.id} className="mt-2 text-sm">
          <p>
            {conflict.family} · {conflict.key} · Paused
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {conflict.choices.map((choice) => (
              <Button
                key={choice.owner}
                size="sm"
                variant="outline"
                onClick={async () => {
                  setError(null)
                  const result = await api.post('merchant/rule-conflict', { id: conflict.id, owner: choice.owner })
                  if (result.kind === 'failure') setError(result.message)
                }}
              >
                Use {choice.owner}: {describeRule(choice.value)}
              </Button>
            ))}
          </div>
        </div>
      ))}
      {incompatible.map(({ item, actions }) => (
        <p key={`${item.name}:${item.level || 0}`} className="mt-2 text-sm">
          {item.name} +{item.level || 0} · {actions.join(' / ')} · Paused. Remove the unwanted rule from the sections above.
        </p>
      ))}
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </SectionCard>
  )
}
