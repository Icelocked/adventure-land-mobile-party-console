/** Managed console builds, from Ryan's tools/console-build/contracts.ts and
 *  dashboard/features/party/console-build-control.tsx. Only the fields the
 *  PWA reads. */
export type BuildComponent = 'dashboard' | 'coordinator' | 'characters'
export type DeploymentMode = 'now' | 'safe' | 'main'
export interface BuildSummary {
  id: string
  createdAt: string
  sourceHash: string
  commit?: string
  dirty?: boolean
  components: Record<BuildComponent, string>
}
export interface DeploymentJournal {
  id: string
  target: string
  previous?: string
  startedAt: string
  phase: 'preparing' | 'waiting-safe' | 'moving-main' | 'activating' | 'resuming' | 'rolling-back' | 'complete' | 'failed'
  mode?: DeploymentMode
  phaseStartedAt?: string
  waiting?: string[]
  error?: string
}
export interface ConsoleBuildStatus {
  active?: string
  available?: string
  pendingBuildCount?: number
  operation?: DeploymentJournal
  builds: BuildSummary[]
  cave?: boolean
}

const components: BuildComponent[] = ['dashboard', 'coordinator', 'characters']

export const deploymentPending = (phase: DeploymentJournal['phase']) => !['complete', 'failed'].includes(phase)

/** The completed build the console offers, unless it is already active. */
export function readyBuild(status: ConsoleBuildStatus): BuildSummary | undefined {
  const candidate = status.builds.find((build) => build.id === status.available)
  return candidate && candidate.id !== status.active ? candidate : undefined
}

export function changedComponents(candidate: BuildSummary, active: BuildSummary | undefined): BuildComponent[] {
  return components.filter((key) => candidate.components[key] !== active?.components[key])
}

/** The badge count: pendingBuildCount, else the builds newer than the active one, at least 1. */
export function pendingBuildCount(status: ConsoleBuildStatus): number {
  const active = status.builds.find((build) => build.id === status.active)
  const newer = status.builds.filter((build) => build.id !== status.active && (!active || build.createdAt > active.createdAt)).length
  return Math.max(1, status.pendingBuildCount ?? newer)
}
