import { useState } from 'react'
import { usePartyApi, useDynamicState, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { WtbPreference, autoStandExplanation } from '@/components/Wtb'
import { useClock } from '@/lib/duration'
import { AccountScreenScaffold } from './AccountScreenScaffold'
import type { ApiResult, CommandResult } from '@/api/partyApi'

const blacklistExplanation =
  'Adds a strike when the merchant reaches an advertised seller but the seller is not visible or their stand stays closed during the bounded wait. Retries pause for 1, 2, 4, 8... minutes after successive strikes. Changed or sold listings and unreachable routes do not cause strikes. Disabling this ignores automatic strikes and stops new ones; manual blocks still apply.'

interface StrikeRecord {
  seller?: string
  serverRegion?: string
  serverIdentifier?: string
  reason?: string
  failures?: number
  until?: number
  updatedAt?: number
}

/** stand-sheet.tsx "Marketplace settings": auto-fill empty stand slots with
 *  the highest priority buy order, the merchant blacklist toggle, a manual
 *  block (minutes, -1 = forever), every strike record with Clear, and a
 *  two-step Clear all. */
export function MarketplaceSettingsScreen() {
  const api = usePartyApi()
  const state = useDynamicState()
  const refreshNow = useRefreshDynamicStateNow()
  const now = useClock()
  const [name, setName] = useState('')
  const [minutes, setMinutes] = useState('60')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const records = Object.entries((state.merchantBlacklist ?? {}) as Record<string, StrikeRecord>).sort(([, a], [, b]) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))

  const save = async (action: () => Promise<ApiResult<CommandResult>>) => {
    setSaving(true)
    setError('')
    const result = await action()
    setSaving(false)
    if (result.kind === 'failure') {
      setError(result.message || 'Could not save marketplace settings')
      return false
    }
    await refreshNow()
    return true
  }
  const blacklist = (payload: Record<string, unknown>) => save(() => api.post('merchant/blacklist', payload))

  return (
    <AccountScreenScaffold title="Marketplace settings" onRefresh={() => void refreshNow()}>
      <div className="flex flex-col gap-4 p-3">
        <p className="text-xs text-muted-foreground">
          Automatic strikes never expire or reset on success. Retry cooldowns are 1, 2, 4, 8… minutes; only Clear removes a strike record. Manual entries can use -1 for forever.
        </p>
        <section aria-label="Stand buy orders" className="flex flex-col gap-3 rounded border border-violet-700 p-3">
          <h3 className="text-sm font-semibold">Stand buy orders</h3>
          <WtbPreference
            label="Automatically fill empty stand slots with highest priority buy order"
            description={autoStandExplanation}
            checked={!!state.autoStandBuys}
            disabled={saving}
            onChange={(enabled) => void save(() => api.post('merchant/native-stand', { action: 'configure', enabled }))}
          />
        </section>
        <section aria-label="Marketplace merchant blacklist" className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Marketplace merchant blacklist</h3>
          <WtbPreference
            label="Enable blacklisting unavailable merchants"
            description={blacklistExplanation}
            checked={!!state.autoBlacklistMerchants}
            disabled={saving}
            onChange={(enabled) => void blacklist({ action: 'configure', enabled })}
          />
          <div className="grid grid-cols-[1fr_7rem_auto] gap-2">
            <Input aria-label="Merchant name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Merchant name" />
            <Input aria-label="Minutes" inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.target.value.replace(/[^0-9-]/g, ''))} placeholder="Minutes / -1" />
            <Button
              disabled={saving}
              onClick={async () => {
                if (await blacklist({ action: 'add', seller: name.trim(), minutes: Number(minutes) })) setName('')
              }}
            >
              Add
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {records.length ? (
              records.map(([key, entry]) => {
                const until = Number(entry.until)
                const coolingDown = until === -1 || until > now
                return (
                  <div key={key} role="group" aria-label={`Strike ${entry.seller}`} className={`flex items-center gap-3 rounded border p-2 ${coolingDown ? 'border-rose-800' : 'border-amber-800'}`}>
                    <div className="min-w-0 flex-1">
                      <p className={`font-semibold ${coolingDown ? 'text-rose-400' : 'text-amber-500'}`}>{entry.seller}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {entry.serverRegion || 'all regions'} {entry.serverIdentifier || 'all servers'} · {entry.reason || 'manual'} · {entry.failures || 0} strikes ·{' '}
                        {until === -1 ? 'blocked forever' : coolingDown ? `${Math.max(1, Math.ceil((until - now) / 60000))}m until retry` : 'eligible for retry'}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" disabled={saving} onClick={() => void blacklist({ action: 'clear', key })}>
                      Clear
                    </Button>
                  </div>
                )
              })
            ) : (
              <p className="text-sm text-muted-foreground">No merchant strike records.</p>
            )}
          </div>
        </section>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          variant="outline"
          className="w-fit"
          disabled={!records.length || saving}
          onClick={() => {
            if (confirmClear) {
              setConfirmClear(false)
              void blacklist({ action: 'clear' })
            } else setConfirmClear(true)
          }}
        >
          {confirmClear ? 'Really clear all?' : 'Clear all'}
        </Button>
      </div>
    </AccountScreenScaffold>
  )
}
