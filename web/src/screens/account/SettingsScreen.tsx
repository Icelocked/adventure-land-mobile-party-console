import { useEffect, useState } from 'react'
import { Copy, Eye, EyeOff } from 'lucide-react'
import { usePartyApi, useDynamicState, useRefreshDynamicStateNow, useRoster } from '@/data/PartyDataProvider'
import { useOpenServerSettings } from '@/lib/ServerSettingsDialogContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AccountScreenScaffold } from './AccountScreenScaffold'
import type { RosterMember } from '@/models'

/** Ports hosting-settings.tsx (pairing toggle), account-settings.tsx
 *  (roster + bankboi prefix), and the realm-control block - see
 *  ui/account/SettingsScreen.kt. Console-update checks and dashboard-
 *  state import/export are a fast-follow, not in v1. */
export function SettingsScreen() {
  const roster = useRoster()
  const dynamicState = useDynamicState()
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const openServerSettings = useOpenServerSettings()
  const [requirePairing, setRequirePairing] = useState<boolean | null>(null)
  const [bankboiPrefix, setBankboiPrefix] = useState<string | null>(null)
  const [showRealms, setShowRealms] = useState(false)
  const [realmError, setRealmError] = useState<string | null>(null)
  const [setHome, setSetHome] = useState(false)

  useEffect(() => {
    void (async () => {
      const result = await api.getRoot('setup/state')
      if (result.kind === 'success') {
        try {
          const parsed = JSON.parse(result.value) as { requirePairing?: boolean }
          setRequirePairing(parsed.requirePairing ?? false)
        } catch {
          // leave unset
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (bankboiPrefix == null) setBankboiPrefix(dynamicState.bankboiPrefix)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynamicState.bankboiPrefix])

  return (
    <AccountScreenScaffold title="Settings" onRefresh={() => void refreshNow()}>
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center justify-between rounded-md border border-border bg-card p-4">
          <div>
            <div className="text-sm font-medium">Require secure pairing</div>
            <div className="text-xs text-muted-foreground">Extra login gate on top of network access</div>
          </div>
          <input
            type="checkbox"
            checked={requirePairing === true}
            onChange={async (event) => {
              const checked = event.target.checked
              const result = await api.postRoot('setup/pairing', { requirePairing: checked })
              if (result.kind === 'success') setRequirePairing(checked)
            }}
            className="size-5"
          />
        </div>

        <div className="rounded-md border border-border bg-card p-4">
          <div className="mb-1 text-sm font-medium">Bankboi prefix</div>
          <div className="flex gap-2">
            <Input value={bankboiPrefix ?? ''} onChange={(e) => setBankboiPrefix(e.target.value)} className="flex-1" />
            <Button onClick={() => void api.setBankboiPrefix(bankboiPrefix ?? '')}>Save</Button>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border bg-card p-4">
          <div>
            <div className="text-sm font-medium">Anniversary auto-chat</div>
            <div className="text-xs text-muted-foreground">Send anniversary chat message when receiving cake from a kiss</div>
          </div>
          <input
            type="checkbox"
            checked={dynamicState.anniversaryAutoChat}
            onChange={(e) => void api.setAnniversaryAutoChat(e.target.checked).then(() => refreshNow())}
            className="size-5"
          />
        </div>

        <div className="rounded-md border border-border bg-card p-4">
          <div className="mb-1 text-sm font-medium">Anniversary chat advertisement</div>
          <p className="mb-2 text-xs text-muted-foreground">Sends the cake-slice trade advertisement to in-game chat right now.</p>
          <Button variant="outline" onClick={() => void api.sendAnniversaryChatAdvertisement()}>
            Send in-game chat now
          </Button>
        </div>

        <ALDataSection />

        <div className="rounded-md border border-border bg-card p-4">
          <div className="mb-1 text-sm font-medium">PWA connection</div>
          <p className="mb-2 text-xs text-muted-foreground">Where this app fetches party data from - same-origin by default.</p>
          <Button variant="outline" onClick={openServerSettings}>
            Change server address
          </Button>
        </div>

        {dynamicState.realmControl && (
          <div className="rounded-md border border-border bg-card p-4">
            <div className="text-sm font-medium">Realm: {dynamicState.realmControl.activeRealm ?? 'unknown'}</div>
            <div className="text-xs text-muted-foreground">Home: {dynamicState.realmControl.homeRealm ?? 'unknown'}</div>
            {realmError && <p className="text-xs text-destructive">{realmError}</p>}
            <button className="mt-1 text-xs text-primary underline" onClick={() => setShowRealms((v) => !v)}>
              {showRealms ? 'Cancel' : 'Switch realm...'}
            </button>
            {showRealms && (
              <div className="mt-1 flex flex-col gap-1">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={setHome} onChange={(e) => setSetHome(e.target.checked)} className="size-4" />
                  Set as home realm
                </label>
                {dynamicState.realmControl.realms
                  .filter((option) => !option.pvp)
                  .map((option) => (
                    <button
                      key={option.key}
                      className="text-left text-xs text-primary underline"
                      onClick={async () => {
                        const result = await api.switchRealm(option.key, setHome)
                        if (result.kind === 'failure') setRealmError(result.message)
                        else {
                          setRealmError(null)
                          setShowRealms(false)
                        }
                      }}
                    >
                      {option.label} ({option.players} online)
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        <div className="text-sm font-medium">Characters</div>
        <div className="flex flex-col gap-1">
          {Object.values(roster).map((member) => (
            <RosterRow key={member.name} member={member} />
          ))}
        </div>
      </div>
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
  const [preparingMail, setPreparingMail] = useState(false)
  const aldata = dynamicState.aldata

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">ALData</div>
          <div className="font-mono text-[10px] uppercase text-muted-foreground">
            Auth: {aldata?.auth ?? 'NO'} · Publish: {aldata?.publishStatus ?? 'idle'}
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
            if (result.kind === 'success') {
              setKey(result.value)
              setPreparingMail(true)
            } else setError(result.message)
            setBusy(false)
          }}
        >
          Prepare mail
        </Button>
      </div>

      {preparingMail && key && (
        <div className="mt-3 rounded-md border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground">
            To <span className="font-mono">earthiverse</span>, subject <span className="font-mono">aldata_auth</span>. Do not resend - each message costs gold.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              onClick={async () => {
                const result = await api.sendMail('earthiverse', 'aldata_auth', key)
                if (result.kind === 'failure') setError(result.message)
                else setPreparingMail(false)
              }}
            >
              Send
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPreparingMail(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Public market browsing needs no key. Publishing requires authentication: generate a unique key, then Prepare mail to send it to ALData for verification. ALData stores this key in
        plaintext - never reuse a password. Allow about a minute, then check status.
      </p>
      {(error ?? aldata?.error) && <p className="mt-2 text-xs text-destructive">{error ?? aldata?.error}</p>}
    </div>
  )
}

function RosterRow({ member }: { member: RosterMember }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
      <span className="text-sm">{member.name}</span>
      <span className="text-xs text-muted-foreground">
        Lv {member.level} {member.ctype}
      </span>
    </div>
  )
}
