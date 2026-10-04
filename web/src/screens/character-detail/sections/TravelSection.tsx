import { useRef, useState } from 'react'
import { usePartyApi, useCharacterDiagnosticsMap, useDynamicState } from '@/data/PartyDataProvider'
import { useClock } from '@/lib/duration'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '../SectionCard'
import type { TravelPlace } from '@/models'

/** Ports the "Send to..." / "Return to leader" (every character) and
 *  "Send merchant to..." / "Go home" (merchant only) quick-travel
 *  buttons from inventory-panel.tsx. "Send to..." opens the preset
 *  location list (travelPlaces) rather than raw coordinate entry. */
export function TravelSection({
  characterName,
  isMerchant,
  travelPlaces,
}: {
  characterName: string
  isMerchant: boolean
  travelPlaces: TravelPlace[]
}) {
  const api = usePartyApi()
  const state = useDynamicState()
  const diagnostics = useCharacterDiagnosticsMap()
  const now = useClock()
  const [showPlaces, setShowPlaces] = useState(false)
  const [showVisits, setShowVisits] = useState(false)
  const [visitMessage, setVisitMessage] = useState<string | null>(null)
  // merchant-visit-control.tsx: "Queuing visit…" and no repeat sends while one is in flight.
  const [queuingVisit, setQueuingVisit] = useState(false)
  const visitRef = useRef(false)
  // merchant-visit-control.tsx: online (seen in the last 10s) non-merchant characters.
  const eligible = Object.entries(diagnostics)
    .filter(([name, detail]) => name !== state.merchantCharacter && detail.ctype !== 'merchant' && Number(detail.seenAt) > 0 && now - Number(detail.seenAt) < 10_000)
    .map(([name]) => name)
  const [error, setError] = useState<string | null>(null)
  // inventory-panel.tsx leaderOnline: a different leader, seen recently.
  const leader = state.leader
  const leaderOnline = !!leader && leader !== characterName && now - Number(diagnostics[leader]?.seenAt || 0) < 10_000
  const report = async (request: Promise<{ kind: string; message?: string }>) => {
    setError(null)
    const result = await request
    if (result.kind === 'failure') setError(result.message ?? 'Command failed')
  }

  return (
    <SectionCard title="Travel">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowPlaces((v) => !v)}>
          {isMerchant ? 'Travel to place…' : 'Send to…'}
        </Button>
        {isMerchant ? (
          <Button size="sm" onClick={() => void report(api.goHome(characterName))}>
            Go home
          </Button>
        ) : (
          <Button size="sm" disabled={!leaderOnline} onClick={() => void report(api.returnToLeader(characterName))}>
            Return to leader
          </Button>
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
                  disabled={queuingVisit}
                  onClick={async () => {
                    if (visitRef.current) return
                    visitRef.current = true
                    setQueuingVisit(true)
                    setError(null)
                    setVisitMessage(null)
                    try {
                      // merchant-visit-control.tsx: queue a merchant visit to that character.
                      const result = await api.sendCommand(name, { type: 'bank' })
                      if (result.kind === 'failure') return setError(result.message)
                      setVisitMessage(`Merchant visit queued for ${name}`)
                      setShowVisits(false)
                    } finally {
                      visitRef.current = false
                      setQueuingVisit(false)
                    }
                  }}
                >
                  {name}
                </Button>
              ))}
              {queuingVisit && <p role="status" className="text-xs text-muted-foreground">Queuing visit…</p>}
              {!eligible.length && <p className="text-xs text-muted-foreground">No other characters are online.</p>}
            </div>
          )}
        </>
      )}
      {showPlaces && <CharacterTravelForm characterName={characterName} places={travelPlaces} onClose={() => setShowPlaces(false)} />}
    </SectionCard>
  )
}

/** character-travel-dialog.tsx, inline: a known area fills the exact map
 *  and coordinates (default main -174, 121), which can also be typed; the
 *  label is the area's name or "map [x, y]", and errors stay in the form. */
function CharacterTravelForm({ characterName, places, onClose }: { characterName: string; places: TravelPlace[]; onClose: () => void }) {
  const api = usePartyApi()
  const [destination, setDestination] = useState('')
  const [travelMap, setTravelMap] = useState('main')
  const [travelX, setTravelX] = useState('-174')
  const [travelY, setTravelY] = useState('121')
  const [error, setError] = useState<string | null>(null)
  const edit = (set: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    setDestination('')
    set(event.target.value)
  }
  const submit = async () => {
    setError(null)
    const location = { map: travelMap.trim(), x: Number(travelX), y: Number(travelY) }
    if (!location.map || !Number.isFinite(location.x) || !Number.isFinite(location.y)) return setError('Enter a map and finite coordinates')
    const label = places.find((entry) => entry.id === destination)?.name || `${location.map} [${location.x}, ${location.y}]`
    const result = await api.sendCharacterTo(characterName, location.map, location.x, location.y, label)
    if (result.kind === 'failure') return setError(result.message || 'Travel command failed')
    onClose()
  }
  return (
    <div role="group" aria-label={`Send ${characterName} to…`} className="mt-2 flex flex-col gap-2 rounded-md border border-cyan-800 p-2.5">
      <p className="text-sm font-medium">Send {characterName} to…</p>
      <p className="text-xs text-muted-foreground">Choose a known area, or enter an exact map and coordinate.</p>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Known area
        <select
          aria-label="Known area"
          value={destination}
          onChange={(event) => {
            setError(null)
            const place = places.find((entry) => entry.id === event.target.value)
            setDestination(event.target.value)
            if (place) {
              setTravelMap(place.id)
              setTravelX(String(place.x))
              setTravelY(String(place.y))
            }
          }}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="">Travel → Places</option>
          {places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-[1fr_5rem_5rem] gap-2">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Map
          <Input value={travelMap} onChange={edit(setTravelMap)} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          X
          <Input inputMode="numeric" value={travelX} onChange={edit(setTravelX)} className="font-mono" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Y
          <Input inputMode="numeric" value={travelY} onChange={edit(setTravelY)} className="font-mono" />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => void submit()}>
          Send character
        </Button>
      </div>
    </div>
  )
}
