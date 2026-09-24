import { usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { Chip } from '@/components/Chip'
import { SectionCard } from '../SectionCard'
import type { PartyStateDynamic } from '@/models'

/** Ports party-workspace.tsx's leader RadioGroup + per-card follow
 *  Checkbox into two independent tap targets - both call the same POST
 *  /party-api/formation. Tapping "Leader" while already leader clears it
 *  (formation's leader field is name-or-null); tapping "Follow" just
 *  flips this character's own follow flag. */
export function LeaderFollowerSection({ characterName, dynamicState }: { characterName: string; dynamicState: PartyStateDynamic }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const isLeader = dynamicState.leader === characterName
  const isFollowing = dynamicState.followers[characterName] === true

  return (
    <SectionCard title="Formation">
      <div className="flex gap-3">
        <Chip
          selected={isLeader}
          onClick={async () => {
            await api.setFormation(isLeader ? null : characterName, characterName, isFollowing)
            await refreshNow()
          }}
        >
          Leader
        </Chip>
        <Chip
          selected={isFollowing}
          onClick={async () => {
            await api.setFormation(dynamicState.leader ?? null, characterName, !isFollowing)
            await refreshNow()
          }}
        >
          Follow
        </Chip>
      </div>
      {!isLeader && dynamicState.leader && <p className="mt-1.5 text-xs text-muted-foreground">Following {dynamicState.leader}</p>}
    </SectionCard>
  )
}
