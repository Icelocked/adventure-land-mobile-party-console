import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { probePwa, recoveryStoragePrefix, startRecovery, type RecoveryStatus } from '@/lib/dashboardRecovery'

/** "Couldn't render" fallback: instead of a blank app, shows the reconnect
 *  countdown with Retry now / Reload now, driven by the recovery state machine. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('PWA render failed', error)
  }

  render() {
    return this.state.failed ? <RenderFailure /> : this.props.children
  }
}

function RenderFailure() {
  const [status, setStatus] = useState<RecoveryStatus>({ seconds: 1, checking: false, blocked: false })
  const recovery = useRef<ReturnType<typeof startRecovery> | null>(null)

  useEffect(() => {
    const storage = typeof window !== 'undefined' ? window.sessionStorage : null
    recovery.current = startRecovery({
      now: () => Date.now(),
      later: (callback, ms) => window.setTimeout(callback, ms),
      cancel: (timer) => window.clearTimeout(timer as number),
      probe: probePwa,
      claimed: (instance) => storage?.getItem(recoveryStoragePrefix + instance) === '1',
      claim: (instance) => storage?.setItem(recoveryStoragePrefix + instance, '1'),
      reload: () => window.location.reload(),
      update: setStatus,
    })
    return () => recovery.current?.dispose()
  }, [])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">The app couldn’t render</h1>
      <p className="text-sm text-muted-foreground">Your characters are managed separately. The app will reconnect automatically when it is ready.</p>
      {status.blocked && <p className="text-sm">The server is ready, but automatic reload is paused to prevent a repeated error loop. You can reload now.</p>}
      <p role="status" className="text-sm text-muted-foreground">
        {status.checking ? 'Checking…' : `Checking again in ${status.seconds}s…`}
      </p>
      <div className="flex gap-2">
        <Button disabled={status.checking} onClick={() => recovery.current?.retry()}>
          Retry now
        </Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reload now
        </Button>
      </div>
    </main>
  )
}
