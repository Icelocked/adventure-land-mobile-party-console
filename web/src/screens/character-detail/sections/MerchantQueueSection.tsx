import { useRef, useState } from 'react'
import { RotateCw, X } from 'lucide-react'
import { usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { AUTOMATIC_ROUTINE_KEYS, ROUTINE_LABELS, routineFor } from '@/lib/routineLabels'
import { Button } from '@/components/ui/button'
import { SectionCard } from '../SectionCard'
import type { MerchantJob } from '@/models'

const jobLabel = (job: MerchantJob): string => job.routine ?? job.reason

// A handful of retries on the same error is normal (a realm hop, a brief
// inventory-full moment); past this it's a genuine stuck loop, not a
// transient hiccup - confirmed against a live account where this exact
// error ("Couldn't use lucky slot: displaced item changed") retried 36+
// times over 3+ hours with zero progress, and nothing in the UI ever
// indicated anything was wrong beyond "nothing's happening."
const STUCK_RECOVERY_ATTEMPTS = 5
const STUCK_AFTER_MS = 3 * 60_000

function stuckReason(job: MerchantJob | null | undefined): string | null {
  if (!job?.lastDeferredReason) return null
  const stuckByAttempts = (job.recoveryAttempts ?? 0) >= STUCK_RECOVERY_ATTEMPTS
  const stuckByAge = !!job.firstDeferredAt && Date.now() - job.firstDeferredAt >= STUCK_AFTER_MS
  return stuckByAttempts || stuckByAge ? job.lastDeferredReason : null
}

/** Ports merchant-card-controls.tsx's "Merchant logistics" widget -
 *  current job + queued jobs, each cancellable, a realm-blocked job also
 *  retryable. Only ever rendered for the merchant character. */
export function MerchantQueueSection({ current, queue }: { current?: MerchantJob | null; queue: MerchantJob[] }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  if (!current && queue.length === 0) return null
  const stuck = stuckReason(current)

  return (
    <SectionCard title={`Merchant logistics · ${queue.length} queued`}>
      {stuck && (
        <p className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
          Stuck: {stuck}
          {current?.recoveryAttempts ? ` · retried ${current.recoveryAttempts}×` : ''} — this needs manual attention
          in-game, not another retry. Cancelling the job below won't clear it if the cause is on the merchant's own
          character state.
        </p>
      )}
      {current && (
        <p className="text-sm">
          Now: {jobLabel(current)} → {current.target}
        </p>
      )}
      <div className="flex flex-col gap-1">
        {queue.map((job) => (
          <div key={job.id ?? `${job.target}-${job.reason}`} className="flex items-center justify-between gap-2">
            <span className="truncate text-sm text-muted-foreground">
              {jobLabel(job)} → {job.target}
              {job.realmBlockedReason ? ` (${job.realmBlockedReason})` : ''}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              {job.realmBlockedReason && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Retry job"
                  onClick={async () => {
                    if (job.id) await api.retryMerchantJob(job.id)
                    await refreshNow()
                  }}
                >
                  <RotateCw className="size-4 text-muted-foreground" />
                </Button>
              )}
              {/* merchant-card-controls.tsx: no cancel for standing gathering jobs. */}
              {job.reason !== 'fishing' && job.reason !== 'mining' && <CancelJobControl job={job} />}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

/** merchant-cancel-job-control.tsx: cancelling an automatic routine's job
 *  also switches that routine off server-side (merchant-control.ts), so it
 *  asks first; a manual job cancels (and undoes its pending intent) at once. */
function CancelJobControl({ job }: { job: MerchantJob }) {
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
        aria-label={`Cancel ${jobLabel(job)}`}
        title={disablesRoutine ? 'Cancel job and disable routine' : 'Cancel and undo pending intent'}
        disabled={pending || !job.id}
        onClick={() => (disablesRoutine ? (setError(null), setConfirming(true)) : void cancelJob())}
      >
        <X className="size-4 text-muted-foreground" />
      </Button>
      {(confirming || error) && (
        <div role="alertdialog" aria-label={`Cancel ${ROUTINE_LABELS[reason] || reason}?`} className="fixed inset-x-3 bottom-3 z-50 rounded-lg border border-destructive/50 bg-card p-3 shadow-lg">
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
