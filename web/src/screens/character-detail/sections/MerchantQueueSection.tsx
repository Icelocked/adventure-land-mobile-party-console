import { RotateCw, X } from 'lucide-react'
import { usePartyApi, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { SectionCard } from '../SectionCard'
import type { MerchantJob } from '@/models'

const jobLabel = (job: MerchantJob): string => job.routine ?? job.reason

/** Ports merchant-card-controls.tsx's "Merchant logistics" widget -
 *  current job + queued jobs, each cancellable, a realm-blocked job also
 *  retryable. Only ever rendered for the merchant character. */
export function MerchantQueueSection({ current, queue }: { current?: MerchantJob | null; queue: MerchantJob[] }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  if (!current && queue.length === 0) return null

  return (
    <SectionCard title={`Merchant logistics · ${queue.length} queued`}>
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
                <button
                  aria-label="Retry job"
                  onClick={async () => {
                    if (job.id) await api.retryMerchantJob(job.id)
                    await refreshNow()
                  }}
                >
                  <RotateCw className="size-4 text-muted-foreground" />
                </button>
              )}
              <button
                aria-label="Cancel job"
                onClick={async () => {
                  await api.post('merchant/job/cancel', { id: job.id ?? '' })
                  await refreshNow()
                }}
              >
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
