/** Pause, Play and the clean shutdown, as core's `consoleControl` and every
 *  POST /party-api/console-control/:action reply carry it. Console:
 *  runtime/coordinator/lifecycle/console-control.ts status(), typed in
 *  dashboard/features/party/console-controls.tsx ConsoleControlState. */
export interface ConsoleControlState {
  paused: boolean
  pausedAt: number | null
  resume: { since: number; waiting: string[] } | null
  shutdown: {
    phase: 'deferred' | 'draining' | 'safe'
    requestedAt: number
    hold: string | null
    waiting: string[]
    command: string
    directory: string
  } | null
  log: { at: number; message: string }[]
}

/** The actions application.ts routes under /party-api/console-control/. */
export type ConsoleControlAction = 'pause' | 'play' | 'shutdown' | 'cancel-shutdown' | 'cancel-resume'
