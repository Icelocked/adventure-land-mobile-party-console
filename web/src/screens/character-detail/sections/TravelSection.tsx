import { useState } from 'react'
import { usePartyApi, useCharacterDiagnosticsMap, useDynamicState } from '@/data/PartyDataProvider'
import { useClock } from '@/lib/duration'
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
  const state = useDynamicState()
  const diagnostics = useCharacterDiagnosticsMap()
  const now = useClock()
  const [showPlaces, setShowPlaces] = useState(false)
  const [showVisits, setShowVisits] = useState(false)
  const [visitMessage, setVisitMessage] = useState<string | null>(null)
  // merchant-visit-control.tsx: online (seen in the last 10s) non-merchant characters.
  const eligible = Object.entries(diagnostics)
    .filter(([name, detail]) => name !== state.merchantCharacter && detail.ctype !== 'merchant' && Number(detail.seenAt) > 0 && now - Number(detail.seenAt) < 10_000)
    .map(([name]) => name)
  const [error, setError] = useState<string | null>(null)
  const report = async (request: Promise<{ kind: string; message?: string }>) => {
    setError(null)
    const result = await request
    if (result.kind === 'failure') setError(result.message ?? 'Command failed')
  }

  return (
    <SectionCard title="Travel">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowPlaces((v) => !v)}>
          {isMerchant ? 'Travel to place…' : 'Send to...'}
        </Button>
        {isMerchant ? (
          <Button size="sm" onClick={() => void report(api.goHome(characterName))}>
            Go home
          </Button>
        ) : (
          !isLeader && (
            <Button size="sm" onClick={() => void report(api.returnToLeader(characterName))}>
              Return to leader
            </Button>
          )
        )}
      </div>
      {error && <p role="alert" className="mt-1.5 text-sm text-destructive">{error}</p>}
      {isMerchant && (
        <>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setShowVisits((v) => !v)}>
            Send merchant to…
          </Button>
          {visitMessage && <p role="status" className="mt-1 text-xs text-amber-500">{visitMessage}</p>}
          {showVisits && (
            <div className="mt-2 flex flex-col gap-1">
              {eligible.map((name) => (
                <Button
                  key={name}
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={async () => {
                    setError(null)
                    setVisitMessage(null)
                    // merchant-visit-control.tsx: queue a merchant visit to that character.
                    const result = await api.sendCommand(name, { type: 'bank' })
                    if (result.kind === 'failure') return setError(result.message)
                    setVisitMessage(`Merchant visit queued for ${name}`)
                    setShowVisits(false)
                  }}
                >
                  {name}
                </Button>
              ))}
              {!eligible.length && <p className="text-xs text-muted-foreground">No other characters are online.</p>}
            </div>
          )}
        </>
      )}
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
