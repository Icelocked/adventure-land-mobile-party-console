import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { QK } from '@/data/queryKeys'
import { DashboardStateImport } from './settings/DashboardStateImport'
import { ConsoleUpdateSettings, HostingSettings } from './settings/ConsoleSettings'
import { AccountMembers } from './settings/AccountMembers'
import { CreateCharacterSheet } from '@/screens/roster/CreateCharacterSheet'
import { Copy, Eye, EyeOff } from 'lucide-react'
import { usePartyApi, useDynamicState, useRefreshDynamicStateNow, useConfigLoaded, useAlDataAuthPending, useAlDataAuthStatus } from '@/data/PartyDataProvider'
import { ConfigLoadingNote } from '@/components/ConfigLoadingNote'
import { useOpenServerSettings } from '@/lib/ServerSettingsDialogContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AccountScreenScaffold } from './AccountScreenScaffold'
import { RealmSection } from './RealmSection'
import { applyPendingUpdate, checkForUpdate, subscribeUpdateStatus, type UpdateStatus } from '@/lib/serviceWorkerUpdate'

/** party-inventory-panels.tsx "Interface settings" as a screen, in its
 *  order: state import/export, realm, characters (create, member grid,
 *  bankboi name), ALData, hosting, console updates and debugging - then
 *  this app's own connection and update controls. */
export function SettingsScreen() {
  const dynamicState = useDynamicState()
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const configLoaded = useConfigLoaded()
  const openServerSettings = useOpenServerSettings()
  const [bankboiPrefix, setBankboiPrefix] = useState<string | null>(null)
  const [prefixStatus, setPrefixStatus] = useState<{ saved: true } | { error: string } | null>(null)
  const [creating, setCreating] = useState(false)
  // console-updates.tsx ConsoleUpdateIndicator: arriving from the "!" scrolls to and focuses the update section.
  const location = useLocation()
  const focusTarget = (location.state as { focus?: string } | null)?.focus
  useEffect(() => {
    if (!focusTarget) return
    let attempts = 0
    const timer = setInterval(() => {
      const target = document.getElementById(focusTarget)
      if (target || ++attempts > 20) {
        clearInterval(timer)
        target?.scrollIntoView({ behavior: 'smooth', block: 'end' })
        target?.focus({ preventScroll: true })
      }
    }, 50)
    return () => clearInterval(timer)
  }, [focusTarget])

  // Seed once, from the real config value - never from the empty default.
  useEffect(() => {
    if (bankboiPrefix == null && configLoaded) setBankboiPrefix(dynamicState.bankboiPrefix)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configLoaded, dynamicState.bankboiPrefix])

  return (
    <AccountScreenScaffold title="Interface settings" onRefresh={() => void refreshNow()}>
      <div className="flex flex-col gap-3 p-3">
        <p className="text-xs text-muted-foreground">Manage saved dashboard state, character connections, and market access.</p>
        <DashboardStateImport />
        <RealmSection control={dynamicState.realmControl ?? { split: false, characters: [], realms: [] }} />

        <section aria-label="Characters" className="rounded-md border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Characters</p>
              <p className="font-mono text-[10px] uppercase text-slate-400">Create and add characters to your account roster.</p>
            </div>
            <Button variant="outline" onClick={() => setCreating(true)}>
              Create character
            </Button>
          </div>
          <AccountMembers />
          <div className="mb-1 mt-4 text-sm font-medium">Default name for bankboi</div>
          <div className="flex gap-2">
            <Input
              aria-label="Default name for bankboi"
              value={bankboiPrefix ?? ''}
              maxLength={11}
              disabled={bankboiPrefix == null}
              onChange={(e) => {
                setBankboiPrefix(e.target.value)
                setPrefixStatus(null)
              }}
              className="flex-1"
            />
            <Button
              disabled={bankboiPrefix == null}
              onClick={async () => {
                setPrefixStatus(null)
                const result = await api.setBankboiPrefix((bankboiPrefix ?? '').trim())
                setPrefixStatus(result.kind === 'success' ? { saved: true } : { error: result.message })
                if (result.kind === 'success') await refreshNow()
              }}
            >
              {prefixStatus && 'saved' in prefixStatus ? 'Saved' : 'Save name'}
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Use 3–11 letters, numbers, or underscores. A number is added automatically, such as {bankboiPrefix || 'MyBank'}0.
          </p>
          {prefixStatus && 'error' in prefixStatus && <p role="alert" className="mt-1 text-sm text-destructive">{prefixStatus.error}</p>}
          <ConfigLoadingNote />
        </section>

        <ALDataSection />
        <HostingSettings />
        <ConsoleUpdateSettings />

        <div className="rounded-md border border-border bg-card p-4">
          <div className="mb-1 text-sm font-medium">PWA connection</div>
          <p className="mb-2 text-xs text-muted-foreground">Where this app fetches party data from - same-origin by default.</p>
          <Button variant="outline" onClick={openServerSettings}>
            Change server address
          </Button>
        </div>

        <AppUpdateSection />

        {dynamicState.steamSwitch?.phase === 'failed' && (
          // party-inventory-panels.tsx: offered while a Steam handoff has failed.
          <Button variant="outline" onClick={() => void api.steamRecover()}>
            Recover Steam handoff after characters are offline
          </Button>
        )}
      </div>
      {creating && <CreateCharacterSheet onClose={() => setCreating(false)} />}
    </AccountScreenScaffold>
  )
}

/** party-inventory-panels.tsx's ALData key-management panel - generate/reveal/copy the
 *  publishing key, check auth status, and "Prepare mail" (fills the fixed earthiverse/
 *  aldata_auth authentication mail so the user can review postage and send it themselves,
 *  same as the dashboard - this never auto-sends, since each message costs real gold). */
function ALDataSection() {
  const api = usePartyApi()
  const dynamicState = useDynamicState()
  const refreshNow = useRefreshDynamicStateNow()
  const [key, setKey] = useState('')
  const [keyVisible, setKeyVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const pending = useAlDataAuthPending()
  // The 15 s pending poll runs app-wide (components/AlDataAuthWatcher.tsx).
  const authStatus = useAlDataAuthStatus()
  const setAuthStatus = (value: string) => queryClient.setQueryData(QK.aldataAuthStatus, value)
  const aldata = dynamicState.aldata
  // party-header.tsx: opening settings loads a stored key (still masked) so Copy works.
  useEffect(() => {
    if (!aldata?.hasKey || key) return
    let alive = true
    void api.revealAlDataKey().then((result) => {
      if (alive && result.kind === 'success') setKey(result.value)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aldata?.hasKey])

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">ALData</div>
          {pending ? <output className="block text-sm text-amber-200">Waiting for mail delivery and ALData verification… Do not resend; each message costs gold.</output> : null}
          <div className="font-mono text-[10px] uppercase text-muted-foreground">
            Auth: {authStatus ?? aldata?.auth ?? 'NO'} · Publish: {aldata?.publishStatus ?? 'idle'}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            const result = await api.checkAlDataAuth()
            if (result.kind === 'failure') setError(result.message)
            else {
              setAuthStatus(result.value)
              if (result.value === 'CORRECT') queryClient.setQueryData(QK.aldataAuthPending, false)
            }
            await refreshNow()
            setBusy(false)
          }}
        >
          Check status
        </Button>
      </div>

      <div className="mt-3 flex gap-2">
        <Input
          readOnly
          type={keyVisible ? 'text' : 'password'}
          value={key}
          placeholder={aldata?.hasKey ? 'Stored key - reveal to view' : 'No key generated'}
          className="flex-1 font-mono text-xs"
        />
        <Button
          size="icon"
          variant="outline"
          aria-label="Reveal key"
          onClick={async () => {
            if (!key) {
              const result = await api.revealAlDataKey()
              if (result.kind === 'success') setKey(result.value)
              else setError(result.message)
            }
            setKeyVisible((v) => !v)
          }}
        >
          {keyVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
        <Button size="icon" variant="outline" aria-label="Copy key" disabled={!key} onClick={() => void navigator.clipboard.writeText(key)}>
          <Copy className="size-4" />
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            const result = await api.generateAlDataKey()
            if (result.kind === 'success') {
              setKey(result.value)
              setKeyVisible(true)
            } else setError(result.message)
            await refreshNow()
            setBusy(false)
          }}
        >
          Generate key
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !aldata?.hasKey}
          onClick={async () => {
            setBusy(true)
            setError(null)
            const result = key ? { kind: 'success' as const, value: key } : await api.revealAlDataKey()
            // use-party-console.tsx: Prepare mail opens the mail composer
            // with the earthiverse / aldata_auth draft (postage shown there).
            if (result.kind === 'success') navigate('/mail', { state: { draft: { recipient: 'earthiverse', subject: 'aldata_auth', message: result.value } } })
            else setError(result.message)
            setBusy(false)
          }}
        >
          Prepare mail
        </Button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Public market browsing needs no key or separate ALData server. Publishing requires authentication: generate a unique key. Prepare mail opens a prefilled authentication mail. Review the postage
        and click Send; your merchant will send it. ALData stores this key in plaintext; never reuse a password. Allow about a minute, then check status.
      </p>
      {(error ?? aldata?.error) && <p className="mt-2 text-xs text-destructive">{error ?? aldata?.error}</p>}
    </div>
  )
}

/** Installed as a home-screen app, there's no browser chrome at all - no
 *  URL bar, no hard-refresh, no way to clear site data. This is the only
 *  way to force a stuck service worker to check for a newer build without
 *  uninstalling and reinstalling the app. */
function AppUpdateSection() {
  const [status, setStatus] = useState<UpdateStatus>('idle')
  useEffect(() => subscribeUpdateStatus(setStatus), [])

  const label =
    status === 'checking'
      ? 'Checking…'
      : status === 'available'
        ? 'Update found'
        : status === 'upToDate'
          ? 'Up to date'
          : status === 'unsupported'
            ? 'Not supported in this browser'
            : 'Check for updates'

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-1 text-sm font-medium">App updates</div>
      <p className="mb-2 text-xs text-muted-foreground">
        An installed home-screen app has no browser address bar to force-refresh from - use this instead if something looks stale.
      </p>
      {status === 'available' ? (
        <Button onClick={applyPendingUpdate}>Reload to update</Button>
      ) : (
        <Button variant="outline" disabled={status === 'checking'} onClick={() => void checkForUpdate()}>
          {label}
        </Button>
      )}
    </div>
  )
}
