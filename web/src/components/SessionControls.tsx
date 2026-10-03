import { useDebugBrowser, useDebugGameUrl } from '@/data/useDebugBrowser'
import { useRef, useState } from 'react'
import { LogOut, Monitor, Server } from 'lucide-react'
import { usePartyApi, useDynamicState } from '@/data/PartyDataProvider'
import { Button } from '@/components/ui/button'

type Action = 'logout' | 'headless' | 'steam'

/** character-session-controls.tsx: Steam (become primary / join Steam),
 *  Headless (leave Steam, keep running) and Log out - each confirmed, and
 *  refused if the character's session or the Steam primary changed while
 *  the confirmation was open. */
export function SessionControls({ name }: { name: string }) {
  const api = usePartyApi()
  const state = useDynamicState()
  const slot = state.activeSlots?.find((entry) => entry.character === name)
  const primaryCharacter = state.activeSlots?.find((entry) => entry.primary)?.character || null
  const pending = !!state.steamSwitch?.phase && state.steamSwitch.phase !== 'complete'
  const [confirmation, setConfirmation] = useState<{ action: Action; slot: number; kind: string; state: string; primary: string | null; isPrimary: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)
  // character-session-controls.tsx: a debug instance offers its game browser instead.
  const debugBrowser = useDebugBrowser()
  const debugGameUrl = useDebugGameUrl()
  const native = slot?.kind === 'native'
  const disabled = !slot || pending || busy
  const changed =
    !slot ||
    slot.index !== confirmation?.slot ||
    slot.kind !== confirmation?.kind ||
    slot.state !== confirmation?.state ||
    primaryCharacter !== confirmation?.primary ||
    !!slot.primary !== confirmation?.isPrimary
  const destination = native ? 'Become Steam primary' : primaryCharacter ? 'Join Steam in the background' : 'Join Steam as primary'
  const action = confirmation?.action
  const label = action === 'logout' ? `Log out ${name}?` : action === 'headless' ? `Run ${name} headless?` : `${destination}: ${name}?`

  const ask = (next: Action) => {
    if (!slot || disabled) return
    setError(null)
    setConfirmation({ action: next, slot: slot.index, kind: slot.kind, state: slot.state, primary: primaryCharacter, isPrimary: !!slot.primary })
  }

  const confirm = async () => {
    if (!confirmation || !slot || disabled || changed || submitting.current) return
    submitting.current = true
    setBusy(true)
    setError(null)
    // use-party-console.tsx logout / moveSteamToHeadless / joinOrPromoteSteam.
    const result =
      action === 'logout'
        ? native
          ? await api.steamAction(slot.character, 'logout')
          : await api.logoutSlot(slot.index)
        : action === 'headless'
          ? await api.steamAction(name, 'headless')
          : await api.steamAction(name, native ? 'primary' : 'login')
    submitting.current = false
    setBusy(false)
    if (result.kind === 'failure') setError(result.message)
    else setConfirmation(null)
  }

  const iconClass = (on: boolean) => `rounded-md border p-1.5 disabled:opacity-40 ${on ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground'}`

  if (debugBrowser)
    return (
      <a
        href={debugGameUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`${name} · Debug browser ${slot?.primary ? 'primary' : 'companion'}`}
        title="View the running debug game browser"
        className="rounded border border-cyan-700 px-2 py-1 text-xs text-cyan-100"
      >
        Debug browser{slot?.primary ? ' · primary' : ''}
      </a>
    )
  return (
    <>
      <div className="flex shrink-0 items-center gap-1" aria-label={`${name} session controls`}>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={native}
          aria-label={slot?.primary ? `${name} is Steam primary` : `${destination}: ${name}`}
          title={native ? 'Currently in Steam' : destination}
          onClick={() => !slot?.primary && ask('steam')}
          className={iconClass(native)}
        >
          <Monitor className="size-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={!!slot && !native}
          aria-label={`Run ${name} headless`}
          title={native ? 'Go headless · log out of Steam and keep running' : 'Currently headless'}
          onClick={() => native && ask('headless')}
          className={iconClass(!!slot && !native)}
        >
          <Server className="size-4" />
        </button>
        <button type="button" disabled={disabled} aria-label={`Log out ${name}`} title="Log out character" onClick={() => ask('logout')} className={iconClass(false)}>
          <LogOut className="size-4" />
        </button>
      </div>
      {confirmation && (
        <div role="alertdialog" aria-label={label} className="fixed inset-x-3 bottom-3 z-50 rounded-lg border border-border bg-card p-3 shadow-lg">
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {action === 'logout'
              ? 'This stops the character and its automation. It will not continue running headless.'
              : action === 'headless'
                ? 'This logs the character out of Steam and keeps it running through caracAL.'
                : native
                  ? `${name} will become the primary Steam view. Other Steam characters briefly reconnect, then continue in Steam.`
                  : primaryCharacter
                    ? `${name} will join Steam in the background. ${primaryCharacter} remains primary.`
                    : `${name} will join Steam as the primary view.`}
          </p>
          {changed && <p className="mt-1 text-xs text-amber-500">The character&apos;s session or Steam primary changed. Cancel and choose the action again.</p>}
          {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={disabled || changed} onClick={() => void confirm()}>
              {busy ? 'Working…' : action === 'logout' ? 'Log out' : action === 'headless' ? 'Go headless' : destination}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
