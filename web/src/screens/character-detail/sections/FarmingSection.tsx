import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { usePartyApi, useRefreshDynamicStateNow, useConfigLoaded, useDynamicState, useCharacterDiagnosticsMap, useCharacters } from '@/data/PartyDataProvider'
import { durationLabel } from '@/lib/duration'
import { canRouteToMonster, FOLLOWER_ROUTE_MESSAGE } from '@/lib/partyRouting'
import { ConfigLoadingNote } from '@/components/ConfigLoadingNote'
import { SpriteIcon } from '@/components/SpriteIcon'
import { FarmingModeControl, type SlotChoice } from '@/components/FarmingModeControl'
import { TankHoldLine } from '@/addons/TankHoldLine'
import { useAddons } from '@/data/useAddons'
import { settingsMenuPath } from '@/lib/settingsTarget'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '../SectionCard'
import { FarmingAreaPicker } from '@/components/FarmingAreaPicker'
import type { Catalog } from '@/lib/farmingZones'
import { addonStatusLines, entryLabel, modePair, resolveFarmingContext } from '@/models'
import type { BestiaryMonster, Sprite, FarmAreaState, HuntBlacklistEntry, MonsterHuntCycle, MonsterHuntStatus } from '@/models'

/** Trigger-button label showing the current selection (names, or a count
 *  for "all"). */
function focusSummary(monsterFocus: string[], bestiaryCatalog: BestiaryMonster[]): string {
  if (monsterFocus.includes('all')) return 'All monsters'
  if (!monsterFocus.length) return 'No monsters selected'
  return monsterFocus.map((id) => bestiaryCatalog.find((m) => m.id === id)?.name ?? id).join(', ')
}

/** The two farming mode rows with the follow indicator, hunt status, and
 *  this character's monster focus. Hunt settings and the blacklist are
 *  their own screen.
 *
 *  `monsterHunt`/`huntBlacklist` arrive already resolved
 *  (models/state.ts resolveFarmingContext), since an independent character
 *  (not leader, not following) can have a different effective setup. */
export function FarmingSection({
  characterName,
  followingLeader,
  isLeader,
  farmArea,
  monsterFocus,
  monsterSearchRadius,
  bestiaryCatalog,
  monsterChoices,
  phoenixRouteOrder,
  position,
  target,
  resolvedTargetType,
  monsterHunt,
  characterHunt,
  huntBlacklist,
  showModes = true,
  showFocus: showFocusPicker = true,
}: {
  /** The mode control is for non-merchant classes,
   *  the monster focus picker for everyone but the configured merchant. */
  showModes?: boolean
  showFocus?: boolean
  characterName: string
  followingLeader?: string
  /** dynamicState.leader === characterName. Distinct from `!followingLeader`,
   *  which is also true for an independent character: party-monster-travel
   *  requires the actual leader; anyone else uses character-travel. */
  isLeader: boolean
  farmArea?: FarmAreaState | null
  monsterFocus: string[]
  monsterSearchRadius: number
  bestiaryCatalog: BestiaryMonster[]
  monsterChoices: Catalog
  phoenixRouteOrder: string[]
  /** This character's current position - used only to rank candidate farming areas by proximity. */
  position?: { map: string; x: number; y: number }
  target?: string
  /** See data/useTargetMonsterType.ts - the real monster type resolved live from the map/entities stream. */
  resolvedTargetType?: string | null
  monsterHunt?: MonsterHuntCycle | null
  characterHunt?: MonsterHuntStatus | null
  huntBlacklist: Record<string, HuntBlacklistEntry>
}) {
  const api = usePartyApi()
  const navigate = useNavigate()
  const refreshNow = useRefreshDynamicStateNow()
  const state = useDynamicState()
  const diagnostics = useCharacterDiagnosticsMap()
  const characters = useCharacters()
  const inherited = !!followingLeader
  // The live mode, not the saved policy.
  const liveMode =
    (characters[characterName]?.vitals?.farmingMode as string | undefined) ||
    (diagnostics[characterName] as { farmingMode?: string } | undefined)?.farmingMode ||
    (state as { partyFarmingMode?: string }).partyFarmingMode ||
    'default'
  // Only the leader or a non-follower can route.
  const canRoute = canRouteToMonster({ leader: state.leader, followers: state.followers }, characterName)
  const routeDescription = canRoute ? 'Find selected monster' : FOLLOWER_ROUTE_MESSAGE
  // The focus header shows the leader's (effective) radius.
  const effectiveRadius = state.monsterSearchRadiusByCharacter[state.leader || characterName] || 400
  const [showFocus, setShowFocus] = useState(false)
  // The route button routes the picker's current (unsaved) selection.
  const [focusDraft, setFocusDraft] = useState<string[] | null>(null)
  const routeFocus = showFocus && focusDraft ? focusDraft : monsterFocus
  const [pickingBackup, setPickingBackup] = useState(false)
  const [backupFocus, setBackupFocus] = useState<string[]>([])
  const [pickingArea, setPickingArea] = useState(false)
  const [busy, setBusy] = useState(false)
  const configLoaded = useConfigLoaded()
  const [error, setError] = useState<string | null>(null)

  // Switching characters re-renders this instance instead of remounting it
  // (one route element for /characters/:name), so MonsterFocusForm would keep
  // the previous character's selection and Save would write it to the new
  // one. Closing the form on switch forces a freshly seeded mount.
  useEffect(() => {
    setShowFocus(false)
    setFocusDraft(null)
    setPickingBackup(false)
    setPickingArea(false)
  }, [characterName])

  const farming = resolveFarmingContext(state, characterName)
  const addons = useAddons()
  const combatEntries = addons.slots['combat-mode']
  const targetEntries = addons.slots['target-mode']
  // A mode button sends its slot's field only. A Hunt with no backup farm or focus opens the Hunt
  // setup on the route's `backup_required` answer, with the focus it carries (console
  // use-party-console.tsx setFarmingSlot).
  const selectSlot = async (choice: SlotChoice) => {
    setError(null)
    const result = await api.setFarmingSlot(characterName, choice)
    if (result.kind === 'success') {
      await refreshNow()
      return
    }
    if (result.code === 'backup_required') {
      const focus = Array.isArray(result.body?.focus) ? result.body.focus.filter((id): id is string => typeof id === 'string') : []
      setBackupFocus(focus)
      setPickingBackup(true)
      return
    }
    setError(result.message)
  }

  return (
    <SectionCard title="Farming">
      <LiveCombatStatus target={target} resolvedTargetType={resolvedTargetType} bestiaryCatalog={bestiaryCatalog} />
      {showModes && (
      <>
      <FarmingModeControl
        combatEntries={combatEntries}
        targetEntries={targetEntries}
        slotsError={addons.error}
        combatMode={farming.combatMode}
        targetMode={farming.targetMode}
        effectiveTarget={farming.effectiveTarget}
        effectiveMode={liveMode}
        followingLeader={followingLeader}
        addonStatus={addonStatusLines(targetEntries, farming.addonFarming)}
        disabled={!configLoaded || pickingBackup || pickingArea}
        onSelect={(choice) => void selectSlot(choice)}
        onSettings={() => navigate(settingsMenuPath({ tab: 'character', character: characterName, section: 'farming' }))}
        farmingLine={<TankHoldLine character={characterName} scope={farming.owner} />}
      />
      <ConfigLoadingNote />
      {!inherited && farmArea?.active && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Active farming zone: {farmArea.active.map} ({Math.round(farmArea.active.x)}, {Math.round(farmArea.active.y)})
          {farmArea.message && !/farming resumed/i.test(farmArea.message) ? ` · ${farmArea.message}` : ''}
        </p>
      )}
      {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
      <HuntStatusBlock
        hunting={farming.effectiveTarget === 'hunt'}
        currentMode={modePair(entryLabel(targetEntries, farming.effectiveTarget), entryLabel(combatEntries, farming.effectiveCombat))}
        hunt={monsterHunt}
        characterHunt={characterHunt}
        blacklist={huntBlacklist}
      />
      </>
      )}

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
              const result = await api.startHuntWithBackup(characterName, { monsterFocus: backupFocus, location: { map: area.map, x: area.x, y: area.y } })
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
          ids={routeFocus.filter((id) => id !== 'all')}
          character={position}
          // Prefer the character's saved waypoint, else the party's.
          waypoint={state.characterLocations?.[characterName] || state.partyLocation}
          // The leader's radius when there is one.
          radius={effectiveRadius}
          busy={busy}
          savedPhoenixOrder={phoenixRouteOrder}
          onCancel={() => setPickingArea(false)}
          onStart={async (area, phoenixRouteOrder) => {
            setBusy(true)
            try {
              const result = phoenixRouteOrder
                ? await api.navigateToMonster('phoenix', { map: area.map, x: area.x, y: area.y }, phoenixRouteOrder)
                : await api.routeToFarmingArea(characterName, isLeader, { map: area.map, x: area.x, y: area.y }, [...new Set(routeFocus.filter((id) => id !== 'all'))], `the selected farming area in ${area.mapName || area.map}`)
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

      {showFocusPicker && (
      <>
      <p className="mb-1 mt-2 font-mono text-[10px] uppercase text-muted-foreground">Monster focus - {effectiveRadius}</p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="min-w-0 flex-1 justify-start overflow-hidden"
          disabled={!configLoaded}
          aria-label={focusSummary(routeFocus, bestiaryCatalog)}
          onClick={() => {
            if (showFocus) setFocusDraft(null)
            setShowFocus((v) => !v)
          }}
        >
          <span className="truncate">{focusSummary(routeFocus, bestiaryCatalog)}</span>
          <span aria-label="Selected monster count" className="ml-auto shrink-0 rounded border border-border px-1.5 font-mono text-[10px]">
            {routeFocus.includes('all') ? 'ALL' : routeFocus.length}
          </span>
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={routeDescription}
          title={routeDescription}
          aria-disabled={!canRoute}
          disabled={pickingBackup || pickingArea}
          className={canRoute ? undefined : 'opacity-60'}
          onClick={() => (canRoute ? setPickingArea(true) : setError(FOLLOWER_ROUTE_MESSAGE))}
        >
          <MapPin className="size-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate(`/characters/${encodeURIComponent(characterName)}/hunt-settings`)}>
          Farming settings...
        </Button>
      </div>
      {showFocus && (
        <MonsterFocusForm
          characterName={characterName}
          monsterFocus={monsterFocus}
          monsterSearchRadius={monsterSearchRadius}
          monsterChoices={monsterChoices}
          priorities={state.monsterPrioritiesByCharacter?.[characterName] ?? {}}
          radiusContext={
            state.followers?.[characterName] && state.leader && state.leader !== characterName
              ? `Following ${state.leader}: effective radius ${state.monsterSearchRadiusByCharacter[state.leader] || 400}. This input saves ${characterName}'s own radius.`
              : 'Radius for Leader'
          }
          onDraftChange={setFocusDraft}
          onClose={() => {
            setShowFocus(false)
            setFocusDraft(null)
          }}
        />
      )}
      </>
      )}
    </SectionCard>
  )
}

/** The character's current target ("Fighting X"); the Hunt lines live in
 *  HuntStatusBlock. */
function LiveCombatStatus({ target, resolvedTargetType, bestiaryCatalog }: { target?: string; resolvedTargetType?: string | null; bestiaryCatalog: BestiaryMonster[] }) {
  const targetMonster = target ? bestiaryCatalog.find((m) => m.id === (resolvedTargetType ?? target)) : undefined
  if (!target) return null
  return (
    <div className="mb-2 rounded-md border border-border bg-muted/30 p-2">
      <div className="flex items-center gap-1.5 text-sm">
        <SpriteIcon sprite={targetMonster?.sprite} size={20} />
        <span>{targetMonster ? `Fighting ${targetMonster.name}` : 'Fighting'}</span>
      </div>
    </div>
  )
}

// The server's monsterChoices carry a
// display name and sprite alongside the spawn geometry farmingZones reads.
type MonsterChoice = Catalog[number] & { name?: string; sprite?: Sprite | null }

/** Monster focus and radius form: "All monsters" is its own row (picking a monster drops
 *  it), an empty selection is saved as [] (never ['all']), Fairy can't be
 *  picked, and the radius is only sent when changed. */
function MonsterFocusForm({
  characterName,
  monsterFocus,
  monsterSearchRadius,
  monsterChoices,
  priorities,
  radiusContext,
  onDraftChange,
  onClose,
}: {
  characterName: string
  monsterFocus: string[]
  monsterSearchRadius: number
  monsterChoices: MonsterChoice[]
  priorities: Record<string, number>
  radiusContext: string
  onDraftChange?: (selected: string[]) => void
  onClose: () => void
}) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const [selected, setSelectedState] = useState<string[]>(monsterFocus)
  const [dirty, setDirty] = useState(false)
  const setSelected = (next: string[]) => {
    setDirty(true)
    setSelectedState(next)
    onDraftChange?.(next)
  }
  // An untouched draft follows the server's saved focus.
  const focusKey = monsterFocus.join(',')
  const [seenFocusKey, setSeenFocusKey] = useState(focusKey)
  if (focusKey !== seenFocusKey) {
    setSeenFocusKey(focusKey)
    if (!dirty) setSelectedState(monsterFocus)
  }
  const [radius, setRadius] = useState(String(monsterSearchRadius))
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fairyExplanation, setFairyExplanation] = useState(false)
  // Per-monster target priority, 0–1000, default 50, higher wins.
  const [priorityDrafts, setPriorityDrafts] = useState<Record<string, string>>({})
  const priorityOf = (id: string) => priorityDrafts[id] ?? String(priorities[id] ?? 50)
  const prioritiesChanged = Object.keys(priorityDrafts).length > 0

  const choices: [string, string, Sprite | null][] = [
    ['all', 'All monsters', null],
    ...monsterChoices.map((monster) => [monster.id, `${monster.name ?? monster.id} · ${monster.id}`, monster.sprite ?? null] as [string, string, Sprite | null]),
  ]
  const query = search.trim().toLowerCase()
  const filtered = query ? choices.filter(([id, label]) => id.toLowerCase().includes(query) || label.toLowerCase().includes(query)) : choices
  const toggle = (id: string, checked: boolean) => {
    if (id === 'tinyp') return setFairyExplanation(true)
    if (id === 'all') return setSelected(checked ? ['all'] : [])
    const rest = selected.filter((value) => value !== 'all')
    setSelected(checked ? [...rest, id] : rest.filter((value) => value !== id))
  }

  return (
    <div role="group" aria-label="Monster focus" className="mt-2 rounded-md border border-border p-2">
      <div className="mb-2 flex gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search monsters…" className="flex-1" />
        <Button size="sm" variant="outline" aria-label="Clear all monster focus" onClick={() => setSelected([])}>
          Clear all
        </Button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {filtered.map(([id, label, sprite]) =>
          id === 'tinyp' ? (
            <button key={id} type="button" aria-disabled="true" onClick={() => setFairyExplanation(true)} className="flex w-full items-center justify-between py-1 text-left text-sm text-muted-foreground">
              <span>{label}</span>
              <span className="text-xs">Disabled</span>
            </button>
          ) : (
            <label key={id} className="flex items-center gap-2 py-1">
              <input type="checkbox" checked={selected.includes(id)} onChange={(e) => toggle(id, e.target.checked)} className="size-4" />
              {sprite ? <SpriteIcon sprite={sprite} size={24} /> : <span className="grid size-6 place-items-center">*</span>}
              <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
              <Input
                type="number"
                min={0}
                max={1000}
                aria-label={`${label} priority`}
                title="Target priority (higher wins)"
                value={priorityOf(id)}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setPriorityDrafts((current) => ({ ...current, [id]: event.target.value }))}
                className="h-8 w-16 shrink-0 px-2 text-center font-mono text-xs"
              />
            </label>
          ),
        )}
        {!filtered.length && <p className="py-4 text-center text-sm text-muted-foreground">No matching monsters</p>}
      </div>
      {fairyExplanation && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          Fairy has no verified regular spawn route. Enable “Passively hunt fairy” to attack on sight.
        </p>
      )}
      <label className="mt-2 block text-xs text-muted-foreground">
        Monster search radius
        <Input aria-label="Monster search radius" inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value)} className="mt-1" />
      </label>
      <p className="mt-1 text-xs text-muted-foreground">{radiusContext} Clearing monster focus resets this to 400.</p>
      <p className="mt-1 text-xs text-muted-foreground">Targets in the selected spawn zone come first. This radius allows nearby targets only when no eligible targets are visible inside that zone.</p>
      {error && <p role="alert" className="mt-1.5 text-sm text-destructive">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={saving}
          onClick={async () => {
            let nextRadius: number | undefined
            if (radius !== String(monsterSearchRadius)) {
              const value = Math.round(Number(radius))
              if (!radius.trim() || !Number.isFinite(value) || value < 1 || value > 10000) {
                setError('Enter a radius from 1 to 10,000.')
                return
              }
              nextRadius = value
            }
            setSaving(true)
            setError(null)
            let nextPriorities: Record<string, number> | undefined
            if (prioritiesChanged) {
              nextPriorities = { ...priorities }
              for (const [id, draft] of Object.entries(priorityDrafts)) {
                const parsed = Number(draft)
                nextPriorities[id] = Number.isFinite(parsed) && draft.trim() ? Math.max(0, Math.min(1000, Math.round(parsed))) : 50
              }
            }
            const result = await api.setFocus(characterName, selected, nextRadius, nextPriorities)
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

/** Hunt status: shown while Hunt is the effective
 *  policy or a Hunt (party or own) exists - stage and message, the backup
 *  batch countdown per member (or the quest owner), the Daisy turn-in wait,
 *  the target, and this character's own quest with its blacklist flag. */
function HuntStatusBlock({
  hunting,
  currentMode,
  hunt,
  characterHunt,
  blacklist,
}: {
  // The scope's target mode is Hunt.
  hunting: boolean
  // The scope's pair in the hunting owner's words, such as "Farming (Auto)".
  currentMode: string
  hunt?: MonsterHuntCycle | null
  characterHunt?: MonsterHuntStatus | null
  blacklist: Record<string, HuntBlacklistEntry>
}) {
  if (!(hunting || hunt || characterHunt)) return null
  return (
    <section aria-label="Hunt status" className="mt-2 border-t border-amber-900/70 pt-2 font-mono text-[10px] text-amber-500">
      <p className="font-semibold">
        {hunting ? 'Hunt status' : 'Last Hunt status'}
        {hunt?.stage ? ` · ${hunt.stage}` : ''}
      </p>
      <p>{hunt?.message || (hunting ? 'Preparing Monster Hunt cycle' : 'Hunt mode is not active')}</p>
      {!hunting ? <p>Current farming mode: {currentMode}. Selecting Hunt rechecks eligible quests; blacklisted quests remain skipped.</p> : null}
      {hunt?.backup ? (
        <div className="mt-1">
          <p>Next batch after every blacklisted quest expires · {durationLabel(Math.max(0, ...Object.values(hunt.backup.members).map((member) => member.remainingMs)))}</p>
          {Object.entries(hunt.backup.members).map(([name, member]) => (
            <p key={name}>
              {name}: {!member.fresh ? 'waiting for fresh status' : member.ready ? 'ready' : `${member.target} · ${durationLabel(member.remainingMs)}`}
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-1">Quest owner{hunt?.owner ? `: ${hunt.owner}` : ''} · when complete or expired</p>
      )}
      {hunt?.turnIn && hunt.turnIn.phase !== 'complete' ? <p className="mt-1">Events wait until Daisy reward claims finish.</p> : null}
      {hunt?.target ? <p className="mt-1">Target: {hunt.target}</p> : null}
      {characterHunt ? (
        <p className="mt-1 text-emerald-500">
          My quest: {characterHunt.id} · {characterHunt.count} left · {durationLabel(characterHunt.remainingMs)}
          {characterHunt.id && blacklist[characterHunt.id] ? ' · Blacklisted — skipped for Hunt' : ''}
        </p>
      ) : null}
    </section>
  )
}
