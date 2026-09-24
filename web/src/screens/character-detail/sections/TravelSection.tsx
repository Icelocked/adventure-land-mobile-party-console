import { useState } from 'react'
import { usePartyApi } from '@/data/PartyDataProvider'
import { Button } from '@/components/ui/button'
import { SectionCard } from '../SectionCard'
import type { TravelPlace } from '@/models'

/** Ports the "Send to..." / "Return to leader" (every character) and
 *  "Send merchant to..." / "Go home" (merchant only) quick-travel
 *  buttons from inventory-panel.tsx. "Send to..." opens the preset
 *  location list (travelPlaces) rather than raw coordinate entry. */
export function TravelSection({
  characterName,
  isMerchant,
  isLeader,
  travelPlaces,
}: {
  characterName: string
  isMerchant: boolean
  isLeader: boolean
  travelPlaces: TravelPlace[]
}) {
  const api = usePartyApi()
  const [showPlaces, setShowPlaces] = useState(false)

  return (
    <SectionCard title="Travel">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowPlaces((v) => !v)}>
          {isMerchant ? 'Send merchant to...' : 'Send to...'}
        </Button>
        {isMerchant ? (
          <Button size="sm" onClick={() => void api.sendCharacterTo(characterName, 'main', 0, 0, 'home')}>
            Go home
          </Button>
        ) : (
          !isLeader && (
            <Button size="sm" onClick={() => void api.returnToLeader(characterName)}>
              Return to leader
            </Button>
          )
        )}
      </div>
      {showPlaces && (
        <div className="mt-2 flex flex-col gap-1">
          {travelPlaces.map((place) => (
            <Button
              key={place.id}
              variant="outline"
              size="sm"
              className="justify-start"
              onClick={async () => {
                await api.sendCharacterTo(characterName, place.id, place.x, place.y, place.name)
                setShowPlaces(false)
              }}
            >
              {place.name}
            </Button>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
