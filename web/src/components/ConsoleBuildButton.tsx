import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { usePartyApi } from '@/data/PartyDataProvider'
import { changedComponents, deploymentPending, pendingBuildCount, readyBuild, type BuildSummary, type ConsoleBuildStatus, type DeploymentMode } from '@/lib/consoleBuild'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

/** GET /console-build every 3s while the page is visible, like useConsoleUpdates. */
function useConsoleBuilds() {
  const api = usePartyApi()
  const [status, setStatus] = useState<ConsoleBuildStatus | null>(null)
  useEffect(() => {
    let alive = true
    const refresh = async () => {
      if (document.hidden) return
      const result = await api.consoleBuilds()
      if (!alive) return
      // A console without managed builds answers 503; the button stays hidden.
      if (result.kind === 'failure') return setStatus(null)
      try {
        setStatus(JSON.parse(result.value) as ConsoleBuildStatus)
      } catch {
        setStatus(null)
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 3000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [api])
  return [status, setStatus] as const
}

/** The header's "Deploy new console build" control, from Ryan's console-build-control.tsx:
 *  Load now (after a confirm), Load when safe and Load at Main, the last two
 *  disabled during a Cave run. */
export function ConsoleBuildButton() {
  const api = usePartyApi()
  const [status, setStatus] = useConsoleBuilds()
  const [menu, setMenu] = useState(false)
  const [confirming, setConfirming] = useState<BuildSummary | null>(null)
  const [submitting, setSubmitting] = useState(false)
  if (!status) return null
  const candidate = readyBuild(status)
  const active = status.builds.find((build) => build.id === status.active)
  const operation = status.operation
  const busy = submitting || (!!operation && deploymentPending(operation.phase))
  if (!candidate && !busy) return null
  const deploy = async (mode: DeploymentMode, build = candidate) => {
    if (!build || submitting) return
    setSubmitting(true)
    const result = await api.deployConsoleBuild(build.id, mode)
    setSubmitting(false)
    if (result.operation) setStatus({ ...status, operation: result.operation })
    setConfirming(null)
    setMenu(false)
  }
  return (
    <>
      <Button size="icon" variant="outline" aria-busy={busy} aria-label="Deploy new console build" title="New console build ready to deploy" className="relative size-8" onClick={() => setMenu(true)}>
        <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} />
        <span aria-label={`${pendingBuildCount(status)} completed builds since deployment`} className="absolute bottom-0 left-0 rounded bg-black/85 px-0.5 font-mono text-[10px] leading-3 text-emerald-300">
          {pendingBuildCount(status)}
        </span>
      </Button>
      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="bottom" className="p-4">
          <SheetHeader className="p-0">
            <SheetTitle>Load console build</SheetTitle>
            <SheetDescription>{candidate ? `Build ${candidate.id} is ready.` : 'A console build is loading.'}</SheetDescription>
          </SheetHeader>
          {busy && operation && (
            <p className="text-xs">
              {operation.phase.replaceAll('-', ' ')} · {new Date(operation.phaseStartedAt || operation.startedAt).toLocaleTimeString()}
            </p>
          )}
          {busy && operation?.waiting?.length ? <p className="text-xs">Waiting: {operation.waiting.join(', ')}</p> : null}
          {operation?.error && <p className="break-words text-xs text-destructive">{operation.error}</p>}
          <div className="mt-2 flex flex-col gap-2">
            <Button variant="outline" disabled={busy || !candidate} onClick={() => { setConfirming(candidate ?? null); setMenu(false) }}>
              Load now
            </Button>
            <Button variant="outline" disabled={busy || !candidate || !!status.cave} onClick={() => void deploy('safe')}>
              Load when safe
            </Button>
            <Button variant="outline" disabled={busy || !candidate || !!status.cave} onClick={() => void deploy('main')}>
              Load at Main
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={!!confirming} onOpenChange={(open) => !open && !submitting && setConfirming(null)}>
        <SheetContent side="bottom" className="p-4">
          <SheetHeader className="p-0">
            <SheetTitle>Load console build now?</SheetTitle>
            <SheetDescription>Loading now may interrupt combat and briefly disconnect headless characters. Characters could die while reconnecting. Load now anyway?</SheetDescription>
          </SheetHeader>
          {confirming && (
            <div className="flex flex-col gap-1 text-sm">
              <p className="break-all font-mono">Build: {confirming.id}</p>
              <p>Built: {confirming.createdAt}</p>
              <p>Changed components: {changedComponents(confirming, active).join(', ') || 'none'}</p>
              <p className="break-all font-mono">Source: {confirming.sourceHash}</p>
              {confirming.commit && (
                <p className="break-all font-mono">
                  Revision: {confirming.commit}
                  {confirming.dirty ? ' (includes local changes)' : ''}
                </p>
              )}
            </div>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" disabled={submitting} onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void deploy('now', confirming ?? undefined)}>
              Load now
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
