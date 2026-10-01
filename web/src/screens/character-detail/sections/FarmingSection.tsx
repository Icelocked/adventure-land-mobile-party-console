import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Chip } from '@/components/Chip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '../SectionCard'
import type { BestiaryMonster, Condition, HuntBlacklistEntry, MonsterHuntCycle, MonsterHuntStatus, MonsterSpawnRecord } from '@/models'
import { formatDuration } from '@/lib/itemFormulas'

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
  target,
  conditions,
  monsterHunt,
  characterHunt,
  huntBlacklist,
}: {
  characterName: string
  farmingPolicy: string
  monsterFocus: string[]
  monsterSearchRadius: number
  bestiaryCatalog: BestiaryMonster[]
  target?: string
  conditions?: Condition[]
  monsterHunt?: MonsterHuntCycle | null
  characterHunt?: MonsterHuntStatus | null
  huntBlacklist: Record<string, HuntBlacklistEntry>
}) {
  const api = usePartyApi()
  const navigate = useNavigate()
  const refreshNow = useRefreshDynamicStateNow()
  const [showFocus, setShowFocus] = useState(false)
  const [pickingBackup, setPickingBackup] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // CharacterDetailScreen's route has no per-character `key`, so switching
  // characters via the switcher row re-renders this same component instance
  // rather than remounting it (App.tsx routes /characters/:name to one
  // element). Without this, MonsterFocusForm's own `selected` state - seeded
  // once from `monsterFocus` at mount - keeps showing the PREVIOUS
  // character's focus selection while `characterName` has already moved on;
  // hitting Save then overwrites the new character's farming focus with the
  // old one's edited list. Closing the form on switch (matching
  // RestockSection/GoldTargetSection's dirty-state reset for the same
  // underlying non-remount issue) forces a fresh mount, seeded correctly,
  // next time it's reopened.
  useEffect(() => {
    setShowFocus(false)
    setPickingBackup(false)
  }, [characterName])

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
      <LiveCombatStatus
        target={target}
        conditions={conditions}
        monsterHunt={monsterHunt}
        characterHunt={characterHunt}
        huntBlacklist={huntBlacklist}
        bestiaryCatalog={bestiaryCatalog}
      />
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

/** What this character is actually doing right now - current target, active
 *  buffs/debuffs, the party's current Hunt quest, and (if Hunt mode) this
 *  character's own quest assignment with a blacklist check. Mirrors
 *  party-console's farming-mode-control.tsx hunt-status block, scoped to
 *  one character's screen. */
function LiveCombatStatus({
  target,
  conditions,
  monsterHunt,
  characterHunt,
  huntBlacklist,
  bestiaryCatalog,
}: {
  target?: string
  conditions?: Condition[]
  monsterHunt?: MonsterHuntCycle | null
  characterHunt?: MonsterHuntStatus | null
  huntBlacklist: Record<string, HuntBlacklistEntry>
  bestiaryCatalog: BestiaryMonster[]
}) {
  const targetMonster = target ? bestiaryCatalog.find((m) => m.id === target) : undefined
  const questMonster = monsterHunt?.target ? bestiaryCatalog.find((m) => m.id === monsterHunt.target) : undefined
  const myQuestMonster = characterHunt?.id ? bestiaryCatalog.find((m) => m.id === characterHunt.id) : undefined
  const myQuestBlacklisted = !!characterHunt?.id && !!huntBlacklist[characterHunt.id]
  if (!target && !conditions?.length && !monsterHunt?.target && !characterHunt?.id) return null
  return (
    <div className="mb-2 space-y-1.5 rounded-md border border-border bg-muted/30 p-2">
      {target && (
        <div className="flex items-center gap-1.5 text-sm">
          <SpriteIcon sprite={targetMonster?.sprite} size={20} />
          <span>Fighting {targetMonster?.name ?? target}</span>
        </div>
      )}
      {monsterHunt?.target && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <SpriteIcon sprite={questMonster?.sprite} size={16} />
          <span>
            Party Hunt{monsterHunt.stage ? ` · ${monsterHunt.stage}` : ''}: {questMonster?.name ?? monsterHunt.target}
            {monsterHunt.message ? ` · ${monsterHunt.message}` : ''}
          </span>
        </div>
      )}
      {characterHunt?.id && (
        <div className="flex items-center gap-1.5 text-xs">
          <SpriteIcon sprite={myQuestMonster?.sprite} size={16} />
          <span className={myQuestBlacklisted ? 'text-destructive' : 'text-muted-foreground'}>
            My quest: {myQuestMonster?.name ?? characterHunt.id} · {characterHunt.count} left
            {characterHunt.remainingMs ? ` · ${formatDuration(characterHunt.remainingMs)}` : ''}
            {myQuestBlacklisted ? ' · Blacklisted — skipped for Hunt' : ''}
          </span>
        </div>
      )}
      {!!conditions?.length && (
        <div className="flex flex-wrap gap-1">
          {conditions.map((condition) => (
            <span key={condition.id} className="rounded bg-background px-1.5 py-0.5 text-xs" title={condition.explanation}>
              {condition.name}
              {condition.remainingMs ? ` (${formatDuration(condition.remainingMs)})` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
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
