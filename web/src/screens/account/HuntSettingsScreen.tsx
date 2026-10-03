import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useDynamicState, usePartyApi, useRefreshDynamicStateNow, useConfigLoaded } from '@/data/PartyDataProvider'
import { ConfigLoadingNote } from '@/components/ConfigLoadingNote'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { resolveFarmingContext, type HuntSettings } from '@/models'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'
import { HuntBlacklistPicker, HuntSpawnSettings, PassiveHuntingMenu, type MonsterChoiceEntry } from './HuntExtras'
import { huntBlacklistLabel, migratePassiveSettings, type PassiveSettings } from '@/lib/hunting'

// runtime/coordinator/hunt/settings.ts defaultHuntSettings.
const DEFAULT_HUNT_SETTINGS: HuntSettings = {
  relocateIfCompeting: true,
  blacklistDeaths: true,
  deathThreshold: 1,
  blacklistExpirations: true,
  expirationThreshold: 1,
}

/** hunt-settings-control.tsx + the Hunt blacklist from farming-mode-
 *  control.tsx's settings dialog, for one character. Like the dashboard,
 *  every control saves its own field as soon as it changes (thresholds on
 *  blur), always scoped with `character`; a character following the leader
 *  sees the leader's settings read-only. */
export function HuntSettingsScreen() {
  const { name = '' } = useParams()
  const dynamicState = useDynamicState()
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const configLoaded = useConfigLoaded()
  // Monster names/sprites live in the bestiary catalog, NOT the item
  // catalog (useCatalogLookup) - a monster id like "booboo" would never
  // resolve there.
  const monsterFor = useMemo(() => {
    const byId = new Map(dynamicState.bestiaryCatalog.map((m) => [m.id, m]))
    return (id: string) => byId.get(id)
  }, [dynamicState.bestiaryCatalog])

  const context = resolveFarmingContext(dynamicState, name)
  const inherited = !!context.followingLeader
  const settings = { ...DEFAULT_HUNT_SETTINGS, ...context.settings }
  const editable = configLoaded && !inherited

  const [deaths, setDeaths] = useState(String(settings.deathThreshold))
  const [expirations, setExpirations] = useState(String(settings.expirationThreshold))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blacklistBusy, setBlacklistBusy] = useState(false)
  const [confirmingClearAll, setConfirmingClearAll] = useState(false)

  useEffect(() => {
    setDeaths(String(settings.deathThreshold))
    setExpirations(String(settings.expirationThreshold))
  }, [settings.deathThreshold, settings.expirationThreshold])

  const save = async (patch: Partial<HuntSettings>) => {
    if (!editable) return
    setBusy(true)
    setError(null)
    const result = await api.saveHuntSettings(name, patch)
    setBusy(false)
    if (result.kind === 'failure') setError(result.message)
    else await refreshNow()
  }

  const threshold = (key: 'deathThreshold' | 'expirationThreshold', text: string) => {
    const n = Number(text)
    if (!text.trim() || !Number.isSafeInteger(n) || n < 1) {
      setError('Thresholds must be positive whole numbers.')
      return
    }
    if (n !== settings[key]) void save({ [key]: n })
  }

  const blacklist = Object.entries(context.blacklist).sort(([a], [b]) => a.localeCompare(b))
  const monsterChoices = dynamicState.monsterChoices as unknown as MonsterChoiceEntry[]
  const passive = migratePassiveSettings(dynamicState.passiveHunting as PassiveSettings | null | undefined, (dynamicState.passiveRareHunts ?? {}) as Record<string, boolean>)
  const afterwards = async <T extends { kind: string },>(result: T) => {
    if (result.kind === 'success') await refreshNow()
    return result
  }

  const clearBlacklist = async (monsterId?: string) => {
    setBlacklistBusy(true)
    setError(null)
    const result = await api.updateHuntBlacklist(name, monsterId ? 'remove' : 'clear', monsterId)
    setBlacklistBusy(false)
    if (result.kind === 'failure') setError(result.message)
    else await refreshNow()
  }

  return (
    <AccountScreenScaffold title={`Hunt settings · ${context.owner}`} onRefresh={() => void refreshNow()}>
      <fieldset disabled={!editable || busy} className="flex flex-col gap-3 p-3">
        {inherited && <p className="text-xs text-muted-foreground">Settings inherited from the leader ({context.owner}).</p>}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.relocateIfCompeting}
            onChange={(e) => void save({ relocateIfCompeting: e.target.checked })}
            className="size-4"
          />
          Relocate to different spawn if competing
        </label>
        <p className="-mt-2 text-xs text-muted-foreground">Relocate only when everyone’s hunt radius is empty and a competing farmer is nearby.</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.blacklistDeaths} onChange={(e) => void save({ blacklistDeaths: e.target.checked })} className="size-4" />
          Blacklist hunts after
          <Input
            aria-label="Deaths before blacklisting"
            inputMode="numeric"
            value={deaths}
            disabled={!settings.blacklistDeaths}
            onChange={(e) => setDeaths(e.target.value)}
            onBlur={() => threshold('deathThreshold', deaths)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="w-16"
          />
          deaths
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.blacklistExpirations} onChange={(e) => void save({ blacklistExpirations: e.target.checked })} className="size-4" />
          Blacklist hunts after
          <Input
            aria-label="Expired hunts before blacklisting"
            inputMode="numeric"
            value={expirations}
            disabled={!settings.blacklistExpirations}
            onChange={(e) => setExpirations(e.target.value)}
            onBlur={() => threshold('expirationThreshold', expirations)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="w-16"
          />
          hunts expire
        </label>
        <p className="text-xs text-muted-foreground">
          Failures accumulate per monster across Hunts. Clearing its blacklist entry resets its counts. Turning a rule off keeps counts and existing blacklist entries.
        </p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <ConfigLoadingNote />
      </fieldset>

      <div className="flex flex-col gap-3 px-3 pb-3">
        <HuntSpawnSettings
          catalog={monsterChoices}
          preferred={(settings.preferredSpawns ?? {}) as Record<string, unknown>}
          disabled={!editable}
          onSave={async (patch) => afterwards(await api.saveHuntSettings(name, patch))}
        />
        <PassiveHuntingMenu settings={passive} catalog={monsterChoices} disabled={!editable} onSave={async (patch) => afterwards(await api.setRareHunting(patch))} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-1 pt-2">
        <h2 className="text-sm font-semibold">Hunt blacklist</h2>
        <HuntBlacklistPicker
          catalog={monsterChoices}
          blacklist={context.blacklist}
          disabled={!editable || blacklistBusy}
          onAdd={async (id) => afterwards(await api.updateHuntBlacklist(name, 'add', id))}
        />
        {confirmingClearAll ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-destructive">
              Remove all {blacklist.length} blacklisted monsters for {context.owner}? Hunt can accept quests for these monsters again.
            </span>
            <Button
              size="sm"
              variant="destructive"
              disabled={!editable || blacklistBusy}
              onClick={() => {
                setConfirmingClearAll(false)
                void clearBlacklist()
              }}
            >
              Clear all
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmingClearAll(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="destructive" disabled={!editable || blacklistBusy || blacklist.length === 0} onClick={() => setConfirmingClearAll(true)}>
            Clear all
          </Button>
        )}
      </div>
      {blacklist.length === 0 ? (
        <EmptyState message="No monsters blacklisted." />
      ) : (
        <div className="flex flex-col gap-1.5 px-3 pb-4">
          {blacklist.map(([id, entry]) => (
            <div key={id} className="flex items-center gap-2.5 rounded-md border border-border bg-card p-2.5">
              <SpriteIcon sprite={monsterFor(id)?.sprite} size={28} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{monsterFor(id)?.name ?? id}</p>
                <p className="text-xs text-muted-foreground">
                  {huntBlacklistLabel(entry) ? `${huntBlacklistLabel(entry)} · ` : ''}
                  {new Date(entry.at).toLocaleString()}
                </p>
              </div>
              <Button size="sm" variant="outline" disabled={!editable || blacklistBusy} onClick={() => void clearBlacklist(id)}>
                Clear
              </Button>
            </div>
          ))}
        </div>
      )}
    </AccountScreenScaffold>
  )
}
