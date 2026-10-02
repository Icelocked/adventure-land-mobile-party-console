import { usePartyApi, useRefreshDynamicStateNow, useConfigLoaded } from '@/data/PartyDataProvider'
import { ConfigLoadingNote } from '@/components/ConfigLoadingNote'
import { Chip } from '@/components/Chip'
import { SectionCard } from '../SectionCard'
import type { PartyStateDynamic } from '@/models'

/** Ports party-workspace.tsx's leader RadioGroup + per-card follow
 *  Checkbox into two independent tap targets on POST /party-api/formation.
 *  "Leader" sends only {leader} (a radio - tapping the current leader does
 *  nothing, as on the dashboard); "Follow" sends only {character, follow}. */
export function LeaderFollowerSection({ characterName, dynamicState }: { characterName: string; dynamicState: PartyStateDynamic }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const configLoaded = useConfigLoaded()
  const isLeader = dynamicState.leader === characterName
  const isFollowing = dynamicState.followers[characterName] === true

  return (
    <SectionCard title="Formation">
      <div className="flex gap-3">
        <Chip
          selected={isLeader}
          disabled={!configLoaded}
          onClick={async () => {
            if (isLeader) return
            await api.setLeader(characterName)
            await refreshNow()
          }}
        >
          Leader
        </Chip>
        <Chip
          selected={isFollowing}
          disabled={!configLoaded}
          onClick={async () => {
            await api.setFollow(characterName, !isFollowing)
            await refreshNow()
          }}
        >
          Follow
        </Chip>
      </div>
      <ConfigLoadingNote />
      {!isLeader && dynamicState.leader && <p className="mt-1.5 text-xs text-muted-foreground">Following {dynamicState.leader}</p>}
    </SectionCard>
  )
}
