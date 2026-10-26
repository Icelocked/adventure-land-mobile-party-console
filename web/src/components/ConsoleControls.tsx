import { useState } from 'react'
import { Pause, Play, Power } from 'lucide-react'
import { useDynamicState, usePartyApi } from '@/data/PartyDataProvider'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { ConsoleControlAction, ConsoleControlState } from '@/models'

/** Core's consoleControl owns the state; a POST reply stands in only until
 *  the next core poll replaces the polled object. Console:
 *  console-controls.tsx useConsoleControl. */
function useConsoleControl() {
  const api = usePartyApi()
  const polled = useDynamicState().consoleControl
  const [reply, setReply] = useState<{ value: ConsoleControlState; basis: typeof polled } | null>(null)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const act = async (action: ConsoleControlAction, body?: { force?: boolean }) => {
    setBusy(true)
    setError(undefined)
    const result = await api.consoleControl(action, body)
    setBusy(false)
    if (result.kind === 'failure') setError(result.message || 'Console control failed')
    else if (result.value.data && typeof result.value.data.paused === 'boolean') setReply({ value: result.value.data as unknown as ConsoleControlState, basis: polled })
  }
  return { control: (reply?.basis === polled ? reply?.value : null) || polled || null, act, busy, error }
}

/** "Paused", "Resuming" or "Safe to stop" beside the party title. */
export function ConsolePausedIndicator() {
  const { control } = useConsoleControl()
  if (!control?.paused) return null
  return (
    <output data-console-paused className="rounded border border-amber-400 bg-amber-950 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-100">
      {control.resume ? 'Resuming' : control.shutdown?.phase === 'safe' ? 'Safe to stop' : 'Paused'}
    </output>
  )
}

/** The header's Pause or Play button and the clean shutdown sheet. Pause
 *  holds every automated action; the characters still defend themselves.
 *  The sheet stays open for the whole shutdown, so its phase and the stop
 *  command stay in view. Console: console-controls.tsx ConsoleControls. */
export function ConsoleControls() {
  const { control, act, busy, error } = useConsoleControl()
  const [dialog, setDialog] = useState(false)
  const [confirmForce, setConfirmForce] = useState(false)
  if (!control) return null
  const shutdown = control.shutdown
  const open = dialog || !!shutdown
  const round = 'size-8 rounded-full'
  return (
    <>
      {control.paused ? (
        <Button size="icon" variant="outline" onClick={() => void act('play')} disabled={busy || !!shutdown} aria-label="Play: resume automated actions" title="Resume automated actions" className={`${round} border-emerald-400 text-emerald-100`}>
          <Play className="size-4" />
        </Button>
      ) : (
        <Button size="icon" variant="outline" onClick={() => void act('pause')} disabled={busy || !!shutdown} aria-label="Pause all automated actions" title="Pause all automated actions" className={`${round} border-amber-500 text-amber-200`}>
          <Pause className="size-4" />
        </Button>
      )}
      <Button size="icon" variant="outline" onClick={() => setDialog(true)} aria-label="Clean shutdown" title="Clean shutdown" className={`${round} border-rose-600 text-rose-200`}>
        <Power className="size-4" />
      </Button>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next && !shutdown) {
            setDialog(false)
            setConfirmForce(false)
          }
        }}
      >
        <SheetContent side="bottom" showCloseButton={false} className="p-4">
          <SheetHeader className="p-0">
            <SheetTitle>{shutdown?.phase === 'safe' ? 'Safe to stop' : 'Clean shutdown'}</SheetTitle>
            <SheetDescription>
              {!shutdown && 'Pause every automated action, wait until the characters hold still, then save the state. The console resumes the same activity after its next start.'}
              {shutdown?.phase === 'deferred' && `Waiting for the fight to end: ${shutdown.hold}.`}
              {shutdown?.phase === 'draining' && 'Pausing and saving the state.'}
              {shutdown?.phase === 'safe' && 'Everything is saved. Stop the container now:'}
            </SheetDescription>
          </SheetHeader>
          {shutdown?.phase === 'draining' && <p className="text-sm">Waiting for: {shutdown.waiting.length ? shutdown.waiting.join(', ') : 'character acknowledgements'}</p>}
          {shutdown?.phase === 'safe' && (
            <div className="flex flex-col gap-1 text-sm">
              <p className="text-muted-foreground">In {shutdown.directory}:</p>
              <code data-console-stop-command className="block select-all break-all rounded border border-border bg-black px-2 py-1 font-mono text-emerald-200">
                {shutdown.command}
              </code>
            </div>
          )}
          {confirmForce && <p className="text-sm text-destructive">Stopping now pauses the characters in the middle of the fight. They only defend themselves until the console resumes.</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            {!shutdown && (
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => {
                  setDialog(false)
                  void act('shutdown')
                }}
              >
                Start clean shutdown
              </Button>
            )}
            {shutdown?.phase === 'deferred' &&
              (confirmForce ? (
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    setConfirmForce(false)
                    void act('shutdown', { force: true })
                  }}
                >
                  Confirm: stop now
                </Button>
              ) : (
                <Button variant="destructive" disabled={busy} onClick={() => setConfirmForce(true)}>
                  Force shutdown
                </Button>
              ))}
            {shutdown ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setDialog(false)
                  setConfirmForce(false)
                  void act('cancel-shutdown')
                }}
              >
                Cancel shutdown
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setDialog(false)}>
                Close
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

/** Shown after a clean shutdown until the characters reconnect and Play runs. */
export function ConsoleResumeBanner() {
  const { control, act, busy } = useConsoleControl()
  if (!control?.resume) return null
  return (
    <output data-console-resuming className="mx-3 mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-500 bg-amber-950 px-3 py-1.5 text-sm text-amber-50">
      <span>
        Resuming previous activity{control.resume.waiting.length ? ` · waiting for ${control.resume.waiting.join(', ')}` : ''}
      </span>
      <Button size="sm" variant="outline" onClick={() => void act('cancel-resume')} disabled={busy}>
        Cancel
      </Button>
    </output>
  )
}
