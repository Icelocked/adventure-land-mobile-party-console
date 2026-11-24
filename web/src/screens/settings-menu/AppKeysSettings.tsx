import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePartyApi } from '@/data/PartyDataProvider'
import { useSettingsWrite } from '@/data/useSettingsWrite'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Account > Apps (console app-keys-settings.tsx): the player issues a key per app with the scopes
// it may use and its "Counts as my own commands" switch, sees each key's last use and revokes it.
// The console shows a new key once. Each setting has its lock against app changes, saved through
// the settings route.
type AppScope = 'read' | 'command' | 'settings' | 'spend'
// The console's public key record (runtime/status/api.ts AppKey).
interface AppKey { name: string; scopes: AppScope[]; ownCommands: boolean; issuedAt: number; lastUsedAt: number | null; revokedAt: number | null }
const SCOPE_WORDS: Record<AppScope, string> = {
  read: 'Read state',
  command: 'Movement and task commands',
  settings: 'Change settings',
  spend: 'Spend or send gold and items',
}
const APPS_KEY = ['apps'] as const

export function AppKeysSettings() {
  const api = usePartyApi()
  const client = useQueryClient()
  const apps = useQuery({
    queryKey: APPS_KEY,
    queryFn: async () => {
      const result = await api.getJsonReportingError<{ apps: AppKey[]; scopes: AppScope[] }>('apps')
      if (result.kind === 'failure') throw new Error(result.message)
      return result.value
    },
  })
  const settings = useSettingsWrite()
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<AppScope[]>(['read'])
  const [ownCommands, setOwnCommands] = useState(false)
  const [issued, setIssued] = useState<{ name: string; key: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = () => client.invalidateQueries({ queryKey: APPS_KEY })
  async function send(path: string, body: unknown) {
    setBusy(true)
    setError(null)
    const result = await api.post(path, body)
    setBusy(false)
    if (result.kind === 'failure') setError(result.message)
    void refresh()
    return result.kind === 'success' ? result.value : null
  }
  async function issue() {
    const result = await send('apps', { name: name.trim(), scopes, ownCommands })
    if (!result) return
    setIssued({ name: name.trim(), key: String(result.data?.key) })
    setName('')
  }
  const locks = (settings.value('appLocks') as string[] | undefined) ?? []
  const lock = (field: string, locked: boolean) => void settings.write([{ field: 'appLocks', value: locked ? [...locks, field] : locks.filter((entry) => entry !== field) }])
  const live = (apps.data?.apps ?? []).filter((app) => app.revokedAt === null)
  const when = (at: number | null) => (at ? new Date(at).toLocaleString() : 'never')
  return (
    <section aria-label="Apps" className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 text-sm">
      <div className="font-medium">Apps</div>
      <p className="text-xs text-muted-foreground">
        Each app that talks to this console gets its own key. A key acts only within the scopes you tick, and its commands rank below yours unless it counts as your own.
        Your paired browsers, the PWA and the Android app need no key.
      </p>
      <div className="flex flex-col gap-2">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="App name" aria-label="App name" />
        {(apps.data?.scopes ?? []).map((scope) => (
          <label key={scope} className="flex items-center gap-2">
            <input type="checkbox" className="size-4" checked={scopes.includes(scope)}
              onChange={(event) => setScopes(event.target.checked ? [...scopes, scope] : scopes.filter((entry) => entry !== scope))} />
            {SCOPE_WORDS[scope]}
          </label>
        ))}
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-4" checked={ownCommands} onChange={(event) => setOwnCommands(event.target.checked)} />
          Counts as my own commands
        </label>
        <Button disabled={!name.trim() || !scopes.length || busy} onClick={() => void issue()}>Issue key</Button>
        {(error || apps.error) && <p role="alert" className="text-destructive">{error ?? apps.error?.message}</p>}
        {issued && (
          <p data-testid="issued-app-key" className="break-all rounded-md border border-amber-500 p-2 text-amber-300">
            Key for {issued.name}, shown only now: <code>{issued.key}</code>
          </p>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {live.map((app) => (
          <li key={app.name} data-testid="app-key" className="flex flex-col gap-1 rounded-md border border-border p-2">
            <span className="font-medium">{app.name}</span>
            <span className="text-xs text-muted-foreground">{app.scopes.map((scope) => SCOPE_WORDS[scope]).join(', ')}</span>
            <span className="text-xs text-muted-foreground">Last used {when(app.lastUsedAt)}</span>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4" checked={app.ownCommands}
                onChange={(event) => void send(`apps/${app.name}/own-commands`, { ownCommands: event.target.checked })} />
              Counts as my own commands
            </label>
            <Button variant="destructive" disabled={busy} onClick={() => void send(`apps/${app.name}/revoke`, {})}>Revoke</Button>
          </li>
        ))}
      </ul>
      <details>
        <summary className="cursor-pointer">Settings locked against apps</summary>
        <fieldset disabled={!settings.ready} className="mt-2 flex flex-col gap-1">
          {settings.fields.filter((entry) => entry.field !== 'appLocks').map((entry) => (
            <label key={entry.field} className="flex items-center gap-2">
              <input type="checkbox" className="size-4" checked={locks.includes(entry.field)} onChange={(event) => lock(entry.field, event.target.checked)} />
              {entry.label ?? entry.field}
            </label>
          ))}
        </fieldset>
        {settings.notice && <p role="alert" className="text-amber-400">{settings.notice}</p>}
      </details>
    </section>
  )
}
