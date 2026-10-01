import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Chip } from '@/components/Chip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '../SectionCard'
import { FarmingAreaPicker } from '@/components/FarmingAreaPicker'
import type { Catalog } from '@/lib/farmingZones'
import type { BestiaryMonster, Condition, FarmAreaState, HuntBlacklistEntry, MonsterHuntCycle, MonsterHuntStatus } from '@/models'
import { formatDuration } from '@/lib/itemFormulas'

/** monster-focus-picker.tsx's own trigger-button label, ported verbatim -
 *  shows what's actually selected right now (names, or a count for "all"),
 *  not a static "open this to find out" label. */
function focusSummary(monsterFocus: string[], bestiaryCatalog: BestiaryMonster[]): string {
  if (monsterFocus.includes('all')) return 'All monsters'
  if (!monsterFocus.length) return 'No monsters selected'
  return monsterFocus.map((id) => bestiaryCatalog.find((m) => m.id === id)?.name ?? id).join(', ')
}

const MODES: { id: 'auto' | 'default' | 'scatter' | 'hunt'; label: string; description: string }[] = [
  { id: 'auto', label: 'Auto', description: 'Default, switching to scatter when learned conditions allow it' },
  { id: 'default', label: 'Default', description: 'Force the normal party formation' },
  { id: 'scatter', label: 'Scatter', description: 'Force one-shot scatter farming' },
  { id: 'hunt', label: 'Hunt', description: 'One quest at a time: leader first, then the next member if its monster is blacklisted' },
]

/** farming-mode-control.tsx ported, scoped down from its full scope:
 *  the mode selector + effective-mode/follow indicator, hunt status, and
 *  this character's own monster focus. Passive/rare hunting rules, the
 *  visual radius-map preview, and Phoenix's 5-region patrol ordering are
 *  NOT ported - all niche/advanced sub-features on top of the core "what
 *  should this character farm" control that this section exists for. Hunt
 *  settings + the blacklist viewer are their own screen (RoutinesScreen-
 *  sized, not an inline card).
 *
 *  `farmingPolicy`/`monsterHunt`/`huntBlacklist` here are already resolved
 *  (CharacterDetailScreen's resolveFarmingContext call) - /farming-mode
 *  itself takes no `character` field (selecting a mode is always account-
 *  wide), but what's actually EFFECTIVE for a given character can differ
 *  from the raw account-wide fields when they run their own independent
 *  farming setup (not the leader, not following) - see models/state.ts's
 *  resolveFarmingContext. */
export function FarmingSection({
  characterName,
  farmingPolicy,
  effectiveMode,
  followingLeader,
  farmArea,
  monsterFocus,
  monsterSearchRadius,
  bestiaryCatalog,
  monsterChoices,
  position,
  target,
  resolvedTargetType,
  conditions,
  monsterHunt,
  characterHunt,
  huntBlacklist,
}: {
  characterName: string
  farmingPolicy: string
  effectiveMode: string
  followingLeader?: string
  farmArea?: FarmAreaState | null
  monsterFocus: string[]
  monsterSearchRadius: number
  bestiaryCatalog: BestiaryMonster[]
  monsterChoices: Catalog
  /** This character's current position - used only to rank candidate farming areas by proximity. */
  position?: { map: string; x: number; y: number }
  target?: string
  /** See data/useTargetMonsterType.ts - the real monster type resolved live from the map/entities stream. */
  resolvedTargetType?: string | null
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
  const [backupFocus, setBackupFocus] = useState<string[]>([])
  const [pickingArea, setPickingArea] = useState(false)
  const [busy, setBusy] = useState(false)
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
    setPickingArea(false)
  }, [characterName])

  // Matches use-party-console.tsx's setFarmingPolicy: try Hunt directly
  // first (the common case once a backup is already configured - no picker
  // shown at all), and only open it when the server actually rejects for
  // missing/invalid backup, not unconditionally on every click.
  const selectMode = async (mode: (typeof MODES)[number]['id']) => {
    setError(null)
    const result = await api.setFarmingMode(mode)
    if (result.kind === 'success') {
      await refreshNow()
      return
    }
    if (mode === 'hunt' && /backup farming/i.test(result.message)) {
      setBackupFocus(monsterFocus.filter((id) => id !== 'all'))
      setPickingBackup(true)
      return
    }
    setError(result.message)
  }

  return (
    <SectionCard title="Farming">
      <LiveCombatStatus
        target={target}
        resolvedTargetType={resolvedTargetType}
        conditions={conditions}
        monsterHunt={monsterHunt}
        characterHunt={characterHunt}
        huntBlacklist={huntBlacklist}
        bestiaryCatalog={bestiaryCatalog}
      />
      <p className="mb-1.5 text-xs text-muted-foreground">
        Account-wide - applies to the whole party.
        {followingLeader ? ` Following ${followingLeader} - effective settings are theirs.` : ''}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {MODES.map((mode) => (
          <Chip key={mode.id} selected={farmingPolicy === mode.id} onClick={() => void selectMode(mode.id)}>
            {mode.label}
          </Chip>
        ))}
        {(farmingPolicy === 'auto' || farmingPolicy === 'hunt') && effectiveMode !== farmingPolicy && (
          <span className="text-xs text-muted-foreground">Currently: {effectiveMode}</span>
        )}
      </div>
      {farmArea?.active && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Active farming zone: {farmArea.active.map} ({Math.round(farmArea.active.x)}, {Math.round(farmArea.active.y)})
          {farmArea.message && !/farming resumed/i.test(farmArea.message) ? ` · ${farmArea.message}` : ''}
        </p>
      )}
      {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}

      {pickingBackup && (
        <FarmingAreaPicker
          catalog={monsterChoices}
          bestiaryCatalog={bestiaryCatalog}
          ids={backupFocus}
          onIdsChange={setBackupFocus}
          character={position}
          radius={monsterSearchRadius}
          busy={busy}
          preparation
          onCancel={() => setPickingBackup(false)}
          onStart={async (area) => {
            setBusy(true)
            try {
              const result = await api.setFarmingMode('hunt', { monsterFocus: backupFocus, location: { map: area.map, x: area.x, y: area.y } })
              if (result.kind === 'failure') setError(result.message)
              else {
                setPickingBackup(false)
                await refreshNow()
              }
            } finally {
              setBusy(false)
            }
          }}
        />
      )}
      {pickingArea && (
        <FarmingAreaPicker
          catalog={monsterChoices}
          bestiaryCatalog={bestiaryCatalog}
          ids={monsterFocus.filter((id) => id !== 'all')}
          character={position}
          radius={monsterSearchRadius}
          busy={busy}
          onCancel={() => setPickingArea(false)}
          onStart={async (area, phoenixRouteOrder) => {
            setBusy(true)
            try {
              const result = phoenixRouteOrder
                ? await api.navigateToMonster('phoenix', { map: area.map, x: area.x, y: area.y }, phoenixRouteOrder)
                : await api.routeToFarmingArea(characterName, !followingLeader, { map: area.map, x: area.x, y: area.y }, monsterFocus.filter((id) => id !== 'all'))
              if (result.kind === 'failure') setError(result.message)
              else {
                setPickingArea(false)
                await refreshNow()
              }
            } finally {
              setBusy(false)
            }
          }}
        />
      )}

      <div className="mt-2 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="min-w-0 flex-1 justify-start overflow-hidden"
          onClick={() => setShowFocus((v) => !v)}
        >
          <span className="truncate">{focusSummary(monsterFocus, bestiaryCatalog)}</span>
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={followingLeader ? 'Only the leader can route to a monster' : 'Find selected monster'}
          title={followingLeader ? 'Only the leader can route to a monster' : 'Find selected monster'}
          disabled={!!followingLeader}
          onClick={() => setPickingArea(true)}
        >
          <MapPin className="size-4" />
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
  resolvedTargetType,
  conditions,
  monsterHunt,
  characterHunt,
  huntBlacklist,
  bestiaryCatalog,
}: {
  target?: string
  resolvedTargetType?: string | null
  conditions?: Condition[]
  monsterHunt?: MonsterHuntCycle | null
  characterHunt?: MonsterHuntStatus | null
  huntBlacklist: Record<string, HuntBlacklistEntry>
  bestiaryCatalog: BestiaryMonster[]
}) {
  const targetMonster = target ? bestiaryCatalog.find((m) => m.id === (resolvedTargetType ?? target)) : undefined
  const questMonster = monsterHunt?.target ? bestiaryCatalog.find((m) => m.id === monsterHunt.target) : undefined
  const myQuestMonster = characterHunt?.id ? bestiaryCatalog.find((m) => m.id === characterHunt.id) : undefined
  const myQuestBlacklisted = !!characterHunt?.id && !!huntBlacklist[characterHunt.id]
  if (!target && !conditions?.length && !monsterHunt?.target && !characterHunt?.id) return null
  return (
    <div className="mb-2 space-y-1.5 rounded-md border border-border bg-muted/30 p-2">
      {target && (
        <div className="flex items-center gap-1.5 text-sm">
          <SpriteIcon sprite={targetMonster?.sprite} size={20} />
          <span>{targetMonster ? `Fighting ${targetMonster.name}` : 'Fighting'}</span>
        </div>
      )}
      {monsterHunt?.target && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <SpriteIcon sprite={questMonster?.sprite} size={16} />
          <span>
            Party Hunt{monsterHunt.stage ? ` · ${monsterHunt.stage}` : ''}: {questMonster?.name ?? monsterHunt.target}
            {monsterHunt.message ? ` · ${monsterHunt.message}` : ''}
            {monsterHunt.owner ? ` · Quest owner: ${monsterHunt.owner}` : ''}
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
