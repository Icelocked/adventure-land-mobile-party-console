import { useState, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { Button } from '@/components/ui/button'
import type { RealmControl } from '@/models'

const running = (control: RealmControl) => !!control.operation && !['complete', 'failed'].includes(control.operation.phase)
const labelFor = (control: RealmControl, key?: string | null) => control.realms.find((realm) => realm.key === key)?.label || key || 'Unknown'

/** Realm panel: where the party actually is
 *  (or "Mixed realms" with each character's realm), home realm, every realm
 *  with its population (PVP shown but disabled), the "Switch realm?"
 *  confirmation, and a running switch's progress. `children` (the
 *  console 1.4 chase settings) render at the bottom of the panel. */
export function RealmSection({ control, children }: { control: RealmControl; children?: ReactNode }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const [choosing, setChoosing] = useState(false)
  const [destination, setDestination] = useState<string | null>(null)
  const [setHome, setSetHome] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const operation = control.operation
  const blocked = running(control)

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Realm</div>
          <div className={`text-xs ${control.split ? 'text-destructive' : 'text-muted-foreground'}`}>
            Current: {control.split ? 'Mixed realms' : labelFor(control, control.currentRealm)} · Home: {labelFor(control, control.homeRealm)}
          </div>
        </div>
        {blocked && <RefreshCw aria-label="Realm switch in progress" className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {control.split && (
        <div className="mt-2 flex flex-col gap-0.5 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          {control.characters.map((member) => (
            <span key={member.name}>
              {member.name}: {member.realm || 'offline'}
            </span>
          ))}
        </div>
      )}

      {!control.homeRealm && control.homeCharacters?.length ? (
        <div className="mt-2 flex flex-col gap-0.5 rounded-md bg-amber-500/10 p-2 text-xs">
          <p>Home realms differ or are unconfirmed:</p>
          {control.homeCharacters.map((member) => (
            <p key={member.name}>
              {member.name}: {member.home || 'unconfirmed'}
            </p>
          ))}
        </div>
      ) : null}

      {!destination && (
        <Button variant="link" size="xs" className="mt-1" disabled={blocked} onClick={() => setChoosing((v) => !v)}>
          {choosing ? 'Cancel' : 'Change realm…'}
        </Button>
      )}
      {choosing && !destination && (
        <div className="mt-1 flex flex-col gap-1">
          {control.realms.map((realm) => (
            <Button
              key={realm.key}
              variant="link"
              size="xs"
              className="justify-start"
              // Nothing to do when the whole party is already there and it is already home.
              disabled={realm.pvp || blocked || (!control.split && realm.key === control.currentRealm && realm.key === control.homeRealm)}
              onClick={() => {
                setError(null)
                setSetHome(false)
                setDestination(realm.key)
              }}
            >
              {realm.label} ({realm.players.toLocaleString()} players){realm.pvp ? ' — disabled' : ''}
            </Button>
          ))}
        </div>
      )}

      {destination && (
        <div role="group" aria-label={setHome ? 'Change home realm?' : 'Switch realm?'} className="mt-2 flex flex-col gap-2 rounded-md border border-border p-3">
          <p className="text-sm font-medium">{setHome ? 'Change home realm?' : 'Switch realm?'}</p>
          <p className="text-xs text-muted-foreground">
            This switches every active party character to {labelFor(control, destination)} and gives non-merchant characters Realm Fatigue.
            {setHome && <span className="mt-2 block text-amber-200">This will change for all characters in the account including characters not currently logged in.</span>}
          </p>
          <div className="flex flex-col gap-1 rounded-md bg-amber-500/10 p-2 text-xs">
            <p>
              <strong>Realm Fatigue:</strong> approximately 30 minutes. Home-realm rewards are paused; ordinary rewards continue.
            </p>
            {destination !== control.homeRealm ? (
              <p>
                <strong>Outside your home realm:</strong> Hop Sickness applies −80 Luck, Gold, and XP, plus −20% output, until you return home or change your
                home realm through Bean.
              </p>
            ) : (
              <p>This destination is already your home realm, so Hop Sickness should not apply.</p>
            )}
          </div>
          {destination !== control.homeRealm && (
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" checked={setHome} onChange={(e) => setSetHome(e.target.checked)} className="mt-0.5 size-4" />
              <span>
                <strong>Set as home realm</strong>
                <span className="block text-muted-foreground">
                  Every account character will request the native home change. Offline characters log in temporarily, one at a time, then log out. One
                  headless character may briefly disconnect to make room and will reconnect afterwards. Adventure Land enforces a 36-hour home-change cooldown
                  per character.
                </span>
              </span>
            </label>
          )}
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setDestination(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                setError(null)
                setBusy(true)
                const result = await api.switchRealm(destination, setHome)
                setBusy(false)
                if (result.kind === 'failure') setError(result.message)
                else {
                  setDestination(null)
                  setChoosing(false)
                  await refreshNow()
                }
              }}
            >
              {busy ? 'Starting…' : setHome ? 'Change home realm' : 'Switch all characters'}
            </Button>
          </div>
        </div>
      )}

      {operation && (
        <div
          className={`mt-3 rounded-md border p-2 text-xs ${
            operation.phase === 'failed' ? 'border-destructive/50 text-destructive' : operation.phase === 'complete' ? 'border-emerald-600/50 text-emerald-500' : 'border-border'
          }`}
        >
          <p className="font-medium capitalize">{operation.phase.replace(/-/g, ' ')}</p>
          {operation.error && <p>{operation.error}</p>}
          {(operation.characters ?? []).map((member) => (
            <p key={member.name}>
              {member.name}: {member.realm || 'waiting'}
              {operation.setHome ? (member.homeConfirmed ? ' — home confirmed' : ' — waiting for home confirmation') : ''}
            </p>
          ))}
        </div>
      )}
      {children}
    </div>
  )
}
