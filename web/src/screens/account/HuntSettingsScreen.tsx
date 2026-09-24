import { useEffect, useMemo, useState } from 'react'
import { useDynamicState, usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { SpriteIcon } from '@/components/SpriteIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'

/** hunt-settings-control.tsx + the Hunt blacklist viewer from farming-
 *  mode-control.tsx's settings dialog, ported as their own screen. */
export function HuntSettingsScreen() {
  const dynamicState = useDynamicState()
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  // Monster names/sprites live in the bestiary catalog, NOT the item
  // catalog (useCatalogLookup) - a monster id like "booboo" would never
  // resolve there.
  const monsterFor = useMemo(() => {
    const byId = new Map(dynamicState.bestiaryCatalog.map((m) => [m.id, m]))
    return (id: string) => byId.get(id)
  }, [dynamicState.bestiaryCatalog])

  const settings = dynamicState.huntSettings
  const [relocate, setRelocate] = useState(true)
  const [blacklistDeaths, setBlacklistDeaths] = useState(true)
  const [deathThreshold, setDeathThreshold] = useState('3')
  const [blacklistExpirations, setBlacklistExpirations] = useState(false)
  const [expirationThreshold, setExpirationThreshold] = useState('1')
  const [seeded, setSeeded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blacklistBusy, setBlacklistBusy] = useState(false)

  useEffect(() => {
    if (!seeded && settings) {
      setRelocate(settings.relocateIfCompeting)
      setBlacklistDeaths(settings.blacklistDeaths)
      setDeathThreshold(String(settings.deathThreshold))
      setBlacklistExpirations(settings.blacklistExpirations)
      setExpirationThreshold(String(settings.expirationThreshold))
      setSeeded(true)
    }
  }, [seeded, settings])

  const blacklist = Object.entries(dynamicState.huntBlacklist).sort(([a], [b]) => a.localeCompare(b))

  const clearBlacklist = async (monsterId?: string) => {
    setBlacklistBusy(true)
    const result = await api.updateHuntBlacklist(monsterId ? 'remove' : 'clear', monsterId)
    setBlacklistBusy(false)
    if (result.kind === 'failure') setError(result.message)
    else await refreshNow()
  }

  return (
    <AccountScreenScaffold title="Hunt settings" onRefresh={() => void refreshNow()}>
      <div className="flex flex-col gap-3 p-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={relocate} onChange={(e) => setRelocate(e.target.checked)} className="size-4" />
          Relocate if competing with another party
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={blacklistDeaths} onChange={(e) => setBlacklistDeaths(e.target.checked)} className="size-4" />
          Blacklist after
          <Input
            value={deathThreshold}
            onChange={(e) => /^\d*$/.test(e.target.value) && setDeathThreshold(e.target.value)}
            className="w-16"
          />
          deaths
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={blacklistExpirations} onChange={(e) => setBlacklistExpirations(e.target.checked)} className="size-4" />
          Blacklist after
          <Input
            value={expirationThreshold}
            onChange={(e) => /^\d*$/.test(e.target.value) && setExpirationThreshold(e.target.value)}
            className="w-16"
          />
          expirations
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            setError(null)
            const result = await api.saveHuntSettings({
              relocateIfCompeting: relocate,
              blacklistDeaths,
              deathThreshold: Number(deathThreshold) || 1,
              blacklistExpirations,
              expirationThreshold: Number(expirationThreshold) || 1,
            })
            setSaving(false)
            if (result.kind === 'failure') setError(result.message)
            else await refreshNow()
          }}
        >
          {saving ? 'Saving...' : 'Save settings'}
        </Button>
      </div>

      <div className="flex items-center justify-between px-3 pb-1 pt-2">
        <h2 className="text-sm font-semibold">Hunt blacklist</h2>
        <Button size="sm" variant="destructive" disabled={blacklistBusy || blacklist.length === 0} onClick={() => void clearBlacklist()}>
          Clear all
        </Button>
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
                  {entry.reason} · {new Date(entry.at).toLocaleString()}
                </p>
              </div>
              <Button size="sm" variant="outline" disabled={blacklistBusy} onClick={() => void clearBlacklist(id)}>
                Clear
              </Button>
            </div>
          ))}
        </div>
      )}
    </AccountScreenScaffold>
  )
}
