import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PartyDataProvider, useCharacters, useConnected, useLastConnectionError } from '@/data/PartyDataProvider'
import { loadServerSettings, saveServerSettings, clearServerSettings, SAME_ORIGIN_SETTINGS, type ServerSettings } from '@/config/serverConfig'

const queryClient = new QueryClient()

/** Stage-1 verification shell: just enough to prove the data layer (REST
 *  client, SSE connection, TanStack Query cache) actually works against
 *  a live server end to end, same-origin through the proxy. Screens/
 *  routing land in later stages - see the plan at
 *  C:\Users\Tyler\.claude\plans\humble-crafting-pebble.md. */
export default function App() {
  const [settings, setSettings] = useState<ServerSettings>(() => loadServerSettings())
  const [showOverride, setShowOverride] = useState(false)

  return (
    <QueryClientProvider client={queryClient}>
      <PartyDataProvider settings={settings} key={settings.baseUrl}>
        <DebugCharacterList onShowOverride={() => setShowOverride(true)} />
      </PartyDataProvider>
      {showOverride && (
        <OverrideDialog
          current={settings}
          onClose={() => setShowOverride(false)}
          onSave={(next) => {
            saveServerSettings(next)
            setSettings(next)
            setShowOverride(false)
          }}
          onReset={() => {
            clearServerSettings()
            setSettings(SAME_ORIGIN_SETTINGS)
            setShowOverride(false)
          }}
        />
      )}
    </QueryClientProvider>
  )
}

function OverrideDialog({
  current,
  onClose,
  onSave,
  onReset,
}: {
  current: ServerSettings
  onClose: () => void
  onSave: (settings: ServerSettings) => void
  onReset: () => void
}) {
  const [input, setInput] = useState(current.baseUrl)
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 p-6">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Server address</h2>
        <p className="text-sm text-muted-foreground">
          Leave blank to use this same origin (the default, correct for the self-hosted setup - see DEPLOYMENT.md). Only set this if you know
          the target server sends CORS headers allowing this origin.
        </p>
        <input
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="(same origin)"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button className="rounded-md px-3 py-2 text-sm text-muted-foreground" onClick={onClose}>
            Cancel
          </button>
          <button className="rounded-md px-3 py-2 text-sm text-muted-foreground underline" onClick={onReset}>
            Reset to same-origin
          </button>
          <button className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground" onClick={() => onSave({ baseUrl: input.trim() })}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function DebugCharacterList({ onShowOverride }: { onShowOverride: () => void }) {
  const characters = useCharacters()
  const connected = useConnected()
  const lastError = useLastConnectionError()
  const names = Object.keys(characters)

  return (
    <div className="mx-auto max-w-sm p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Party ({connected ? 'connected' : 'connecting...'})</h1>
        <button className="text-xs text-muted-foreground underline" onClick={onShowOverride}>
          server address
        </button>
      </div>
      {!connected && lastError && <p className="mb-4 text-sm text-destructive">{lastError}</p>}
      {names.length === 0 ? (
        <p className="text-sm text-muted-foreground">No characters online yet.</p>
      ) : (
        <ul className="space-y-2">
          {names.map((name) => {
            const vitals = characters[name].vitals
            return (
              <li key={name} className="rounded-md border border-border bg-card p-3 text-sm">
                <div className="font-medium">{name}</div>
                {vitals ? (
                  <div className="text-muted-foreground">
                    Lv {vitals.level} {vitals.ctype} · HP {vitals.hp}/{vitals.max_hp} · MP {vitals.mp}/{vitals.max_mp}
                  </div>
                ) : (
                  <div className="text-muted-foreground">offline</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
