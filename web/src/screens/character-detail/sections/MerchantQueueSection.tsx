import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useDomainInterest, useDynamicState, usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { AUTOMATIC_ROUTINE_KEYS, ROUTINE_LABELS, routineFor } from '@/lib/routineLabels'
import { merchantJobLabel } from '@/lib/merchantJobLabel'
import { durationLabel } from '@/lib/duration'
import { Button } from '@/components/ui/button'
import { SectionCard } from '../SectionCard'
import type { ActivityEntry, MerchantJob } from '@/models'

// A handful of retries on the same error is normal (a realm hop, a brief
// inventory-full moment); past this it's a stuck loop. Errors like
// "Couldn't use lucky slot: displaced item changed" can otherwise retry
// for hours with no progress and no visible sign.
const STUCK_RECOVERY_ATTEMPTS = 5
const STUCK_AFTER_MS = 3 * 60_000

function stuckReason(job: MerchantJob | null | undefined): string | null {
  if (!job?.lastDeferredReason) return null
  const stuckByAttempts = (job.recoveryAttempts ?? 0) >= STUCK_RECOVERY_ATTEMPTS
  const stuckByAge = !!job.firstDeferredAt && Date.now() - job.firstDeferredAt >= STUCK_AFTER_MS
  return stuckByAttempts || stuckByAge ? job.lastDeferredReason : null
}

/** "Merchant logistics" and "Activity": the
 *  current job and the queue (priority, label, target, status, cancel /
 *  retry), the Merchant's Luck upkeep line, and the merchant's activity log
 *  with its cleanup actions. Only ever rendered for the merchant. */
export function MerchantQueueSection() {
  const state = useDynamicState()
  const catalog = state.merchantCatalog?.allItems ?? []
  const current = state.merchantCurrent
  const queue = state.merchantQueue
  const stuck = stuckReason(current)
  const jobLabel = (job: MerchantJob) => merchantJobLabel(job, catalog)
  const report = current?.commandReport as { state?: string; reason?: string } | undefined
  const jobs = [
    ...(current
      ? [
          {
            job: current,
            status:
              report?.state === 'deferred'
                ? `Waiting: ${report.reason || 'temporarily blocked'}`
                : current.reason === 'marked items' && current.phase === 'processing'
                  ? 'finishing collection'
                  : current.phase || 'in progress',
          },
        ]
      : []),
    ...queue.map((job) => ({ job, status: 'queued' })),
  ]
  const mluck = state.mluckSchedule

  return (
    <SectionCard title={`Merchant logistics · ${queue.length} queued`}>
      {stuck && (
        <p className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
          Stuck: {stuck}
          {current?.recoveryAttempts ? ` · retried ${current.recoveryAttempts}×` : ''} — this needs manual attention in-game, not another retry. Cancelling the job
          below won't clear it if the cause is on the merchant's own character state.
        </p>
      )}
      <div className="flex flex-col gap-1 font-mono text-xs">
        {!jobs.length && <p className="text-muted-foreground">No queued work</p>}
        {jobs.map(({ job, status }, index) => {
          const target = job.target && job.reason !== 'join giveaway' ? ` · ${job.target}` : ''
          const side = job.realmBlockedReason || (job.retryAt && job.retryAt > Date.now() ? `Retry at ${new Date(job.retryAt).toLocaleTimeString()}` : job.pauseReason || status)
          return (
            <div key={job.id || `${job.reason}-${index}`} className="flex min-w-0 items-center gap-2">
              {status === 'queued' && job.reason !== 'fishing' && job.reason !== 'mining' && <CancelJobControl job={job} label={jobLabel(job)} />}
              <span title={`${jobLabel(job)}${target}`} className={`min-w-0 flex-1 truncate ${index === 0 && current ? 'text-amber-500' : 'text-muted-foreground'}`}>
                <span className="mr-1 text-amber-600">P{job.priority ?? state.merchantRoutinePriorities[routineFor(job)] ?? 50}</span>
                {jobLabel(job)}
                {target}
              </span>
              <span className="max-w-32 shrink-0 truncate text-muted-foreground" title={side}>
                {side}
              </span>
              {job.realmRetryExhausted && <RetryJobButton id={job.id} />}
            </div>
          )
        })}
        {mluck && !jobs.some(({ job }) => job.reason === 'merchant luck' && job.target === mluck.target) && (
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-muted-foreground">Merchant&apos;s Luck upkeep · {mluck.target}</span>
            <span className="shrink-0 text-muted-foreground/70">{mluck.status === 'scheduled' ? `dispatch in ${durationLabel(mluck.dispatchInMs)}` : mluck.status}</span>
          </div>
        )}
      </div>
      <MerchantActivity />
    </SectionCard>
  )
}

function RetryJobButton({ id }: { id?: string }) {
  const api = usePartyApi()
  return (
    <Button size="xs" variant="outline" disabled={!id} onClick={() => id && void api.retryMerchantJob(id)}>
      Retry
    </Button>
  )
}

/** Merchant activity, newest first, time (full date on tap/hover), "— details", coloured by
 *  level, with Clear stale orders / Clear history and their results. */
function MerchantActivity() {
  const [open, setOpen] = useState(false)
  return (
    <details className="mt-3" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-xs font-medium uppercase text-amber-600">Activity</summary>
      {open && <MerchantActivityLog />}
    </details>
  )
}

function MerchantActivityLog() {
  // Logs poll at their fast cadence while this is open.
  useDomainInterest('logs')
  const api = usePartyApi()
  const state = useDynamicState()
  const [result, setResult] = useState<string | null>(null)
  const entries: ActivityEntry[] = [...(state.merchantActivity ?? [])].reverse()
  return (
    <>
      <div className="mt-2 flex items-center justify-end gap-3">
        {result && <span className="mr-auto text-[11px] text-emerald-500">{result}</span>}
        <button
          type="button"
          className="text-[11px] text-violet-400"
          onClick={async () => {
            const response = await api.clearStaleOrders()
            if (response.kind === 'failure') return setResult(response.message || 'Cleanup failed')
            const data = response.value.data ?? {}
            setResult(`Removed ${Number(data.deliveriesRemoved) || 0} deliveries, ${Number(data.bankMarksRemoved) || 0} bank marks`)
          }}
        >
          Clear stale orders
        </button>
        <button
          type="button"
          className="text-[11px] text-destructive"
          onClick={async () => {
            const response = await api.clearMerchantActivity()
            setResult(response.kind === 'failure' ? response.message || 'Cleanup failed' : 'Activity history cleared')
          }}
        >
          Clear history
        </button>
      </div>
      <div className="mt-2 max-h-48 space-y-1 overflow-y-auto font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
        {entries.map((entry, index) => (
          <p key={`${entry.at}-${index}`} className={entry.level === 'error' ? 'text-destructive' : entry.level === 'success' ? 'text-emerald-500' : undefined}>
            <time className="mr-2 opacity-70" dateTime={new Date(entry.at).toISOString()} title={new Date(entry.at).toLocaleString()}>
              {new Date(entry.at).toLocaleTimeString()}
            </time>
            {entry.message}
            {entry.details != null && <span className="ml-1 opacity-75">— {typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details)}</span>}
          </p>
        ))}
      </div>
    </>
  )
}

/** Cancelling an automatic routine's job
 *  also switches that routine off server-side (merchant-control.ts), so it
 *  asks first; a manual job cancels (and undoes its pending intent) at once. */
function CancelJobControl({ job, label }: { job: MerchantJob; label: string }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const reason = routineFor(job)
  const disablesRoutine = AUTOMATIC_ROUTINE_KEYS.has(reason)
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)

  const cancelJob = async () => {
    if (!job.id || busy.current) return
    busy.current = true
    setPending(true)
    setError(null)
    const result = await api.post('merchant/job/cancel', { id: job.id })
    busy.current = false
    setPending(false)
    if (result.kind === 'failure') return setError(result.message)
    setConfirming(false)
    await refreshNow()
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Cancel ${label}`}
        title={disablesRoutine ? 'Cancel job and disable routine' : 'Cancel and undo pending intent'}
        disabled={pending || !job.id}
        onClick={() => (disablesRoutine ? (setError(null), setConfirming(true)) : void cancelJob())}
      >
        <X className="size-4 text-muted-foreground" />
      </Button>
      {(confirming || error) && (
        <div role="alertdialog" aria-label={`Cancel ${ROUTINE_LABELS[reason] || reason}?`} className="fixed inset-x-3 bottom-3 z-50 rounded-lg border border-destructive/50 bg-card p-3 font-sans shadow-lg">
          {confirming && (
            <>
              <p className="text-sm font-medium">Cancel {ROUTINE_LABELS[reason] || reason}?</p>
              <p className="mt-1 text-xs text-muted-foreground">Canceling this job will also disable this routine until you re-enable it in Routines.</p>
            </>
          )}
          {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => (setConfirming(false), setError(null))}>
              Cancel
            </Button>
            {confirming && (
              <Button size="sm" variant="destructive" disabled={pending} onClick={() => void cancelJob()}>
                {pending ? 'Canceling…' : 'Confirm'}
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
