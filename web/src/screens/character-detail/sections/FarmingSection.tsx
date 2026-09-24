import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Chip } from '@/components/Chip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '../SectionCard'
import type { BestiaryMonster, MonsterSpawnRecord } from '@/models'

const MODES: { id: 'auto' | 'default' | 'scatter' | 'hunt'; label: string; description: string }[] = [
  { id: 'auto', label: 'Auto', description: 'Default, switching to scatter when learned conditions allow it' },
  { id: 'default', label: 'Default', description: 'Force the normal party formation' },
  { id: 'scatter', label: 'Scatter', description: 'Force one-shot scatter farming' },
  { id: 'hunt', label: 'Hunt', description: 'One quest at a time: leader first, then the next member if its monster is blacklisted' },
]

/** farming-mode-control.tsx ported, scoped down from its full scope:
 *  the mode selector (account-wide - /farming-mode takes no `character`
 *  field at all) and this character's own monster focus. Passive/rare
 *  hunting rules, the visual radius-map preview, and Phoenix's 5-region
 *  patrol ordering are NOT ported - all niche/advanced sub-features on
 *  top of the core "what should this character farm" control that this
 *  section exists for. Hunt settings + the blacklist viewer are their
 *  own screen (RoutinesScreen-sized, not an inline card). */
export function FarmingSection({
  characterName,
  farmingPolicy,
  monsterFocus,
  monsterSearchRadius,
  bestiaryCatalog,
}: {
  characterName: string
  farmingPolicy: string
  monsterFocus: string[]
  monsterSearchRadius: number
  bestiaryCatalog: BestiaryMonster[]
}) {
  const api = usePartyApi()
  const navigate = useNavigate()
  const refreshNow = useRefreshDynamicStateNow()
  const [showFocus, setShowFocus] = useState(false)
  const [pickingBackup, setPickingBackup] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectMode = async (mode: (typeof MODES)[number]['id']) => {
    setError(null)
    if (mode === 'hunt') {
      setPickingBackup(true)
      return
    }
    const result = await api.setFarmingMode(mode)
    if (result.kind === 'failure') setError(result.message)
    else await refreshNow()
  }

  return (
    <SectionCard title="Farming">
      <p className="mb-1.5 text-xs text-muted-foreground">Account-wide - applies to the whole party.</p>
      <div className="flex flex-wrap gap-1.5">
        {MODES.map((mode) => (
          <Chip key={mode.id} selected={farmingPolicy === mode.id} onClick={() => void selectMode(mode.id)}>
            {mode.label}
          </Chip>
        ))}
      </div>
      {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}

      {pickingBackup && (
        <HuntBackupPicker
          bestiaryCatalog={bestiaryCatalog}
          onCancel={() => setPickingBackup(false)}
          onStart={async (monsterFocusIds, location) => {
            const result = await api.setFarmingMode('hunt', { monsterFocus: monsterFocusIds, location })
            if (result.kind === 'failure') setError(result.message)
            else {
              setPickingBackup(false)
              await refreshNow()
            }
          }}
        />
      )}

      <div className="mt-2 flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setShowFocus((v) => !v)}>
          {characterName}'s monster focus
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/hunt-settings')}>
          Hunt settings...
        </Button>
      </div>
      {showFocus && (
        <MonsterFocusForm
          characterName={characterName}
          monsterFocus={monsterFocus}
          monsterSearchRadius={monsterSearchRadius}
          bestiaryCatalog={bestiaryCatalog}
          onClose={() => setShowFocus(false)}
        />
      )}
    </SectionCard>
  )
}

function MonsterFocusForm({
  characterName,
  monsterFocus,
  monsterSearchRadius,
  bestiaryCatalog,
  onClose,
}: {
  characterName: string
  monsterFocus: string[]
  monsterSearchRadius: number
  bestiaryCatalog: BestiaryMonster[]
  onClose: () => void
}) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const [selected, setSelected] = useState<string[]>(monsterFocus)
  const [radius, setRadius] = useState(String(monsterSearchRadius))
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = bestiaryCatalog.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
  const toggle = (id: string) => setSelected((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]))

  return (
    <div className="mt-2 rounded-md border border-border p-2">
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search monsters..." className="mb-2" />
      <div className="max-h-64 overflow-y-auto">
        {filtered.map((monster) => (
          <label key={monster.id} className="flex items-center gap-2 py-1">
            <input type="checkbox" checked={selected.includes(monster.id)} onChange={() => toggle(monster.id)} className="size-4" />
            <SpriteIcon sprite={monster.sprite} size={24} />
            <span className="text-sm">{monster.name}</span>
          </label>
        ))}
      </div>
      <label className="mt-2 block text-xs text-muted-foreground">
        Search radius
        <Input value={radius} onChange={(e) => /^\d*$/.test(e.target.value) && setRadius(e.target.value)} className="mt-1" />
      </label>
      {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            setError(null)
            const result = await api.setFocus(characterName, selected.length ? selected : ['all'], Number(radius) || 400)
            setSaving(false)
            if (result.kind === 'failure') setError(result.message)
            else {
              await refreshNow()
              onClose()
            }
          }}
        >
          Save
        </Button>
      </div>
    </div>
  )
}

function HuntBackupPicker({
  bestiaryCatalog,
  onCancel,
  onStart,
}: {
  bestiaryCatalog: BestiaryMonster[]
  onCancel: () => void
  onStart: (monsterFocus: string[], location: { map: string; x: number; y: number }) => void
}) {
  const [search, setSearch] = useState('')
  const [selectedMonsters, setSelectedMonsters] = useState<string[]>([])
  const [chosenLocation, setChosenLocation] = useState<MonsterSpawnRecord | null>(null)

  const filtered = bestiaryCatalog.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
  const toggleMonster = (id: string) => {
    setSelectedMonsters((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]))
    setChosenLocation(null)
  }

  const candidateLocations = useMemo(() => {
    const records: MonsterSpawnRecord[] = []
    for (const id of selectedMonsters) {
      const monster = bestiaryCatalog.find((m) => m.id === id)
      for (const record of monster?.spawnRecords ?? []) records.push(record)
    }
    return records
  }, [selectedMonsters, bestiaryCatalog])

  return (
    <div className="mt-2 rounded-md border border-border p-2">
      <p className="mb-1 text-xs text-muted-foreground">Select backup farming monsters and a spawn location. Hunt returns here between quests.</p>
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search monsters..." className="mb-2" />
      <div className="max-h-40 overflow-y-auto">
        {filtered.map((monster) => (
          <label key={monster.id} className="flex items-center gap-2 py-1">
            <input type="checkbox" checked={selectedMonsters.includes(monster.id)} onChange={() => toggleMonster(monster.id)} className="size-4" />
            <SpriteIcon sprite={monster.sprite} size={24} />
            <span className="text-sm">{monster.name}</span>
          </label>
        ))}
      </div>
      {selectedMonsters.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-xs text-muted-foreground">Spawn location</p>
          <div className="max-h-40 overflow-y-auto">
            {candidateLocations.length === 0 && <p className="text-xs text-muted-foreground">No known spawn locations for the selected monsters.</p>}
            {candidateLocations.map((record, index) => (
              <button
                key={`${record.map}-${record.x}-${record.y}-${index}`}
                onClick={() => setChosenLocation(record)}
                className={`block w-full rounded-md border p-1.5 text-left text-sm ${chosenLocation === record ? 'border-primary bg-primary/10' : 'border-border'}`}
              >
                {record.mapName ?? record.map} ({Math.round(record.x)}, {Math.round(record.y)})
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!selectedMonsters.length || !chosenLocation}
          onClick={() => chosenLocation && onStart(selectedMonsters, { map: chosenLocation.map, x: chosenLocation.x, y: chosenLocation.y })}
        >
          Save backup and start Hunt
        </Button>
      </div>
    </div>
  )
}
