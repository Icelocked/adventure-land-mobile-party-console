import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { applyPendingUpdate, subscribeUpdateStatus, type UpdateStatus } from '@/lib/serviceWorkerUpdate'

/** A new build is detected passively (never a forced reload - that could
 *  yank someone off a half-filled form) and surfaced here as a persistent,
 *  impossible-to-miss bar rather than a toast that could be dismissed by
 *  accident - an installed standalone PWA has no other way to notice a
 *  new version exists at all. */
export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>('idle')
  useEffect(() => subscribeUpdateStatus(setStatus), [])
  if (status !== 'available') return null

  return (
    <div className="sticky top-0 z-[90] flex items-center justify-between gap-2 border-b border-emerald-600 bg-emerald-950 px-3 py-2 text-sm text-emerald-100">
      <span>A new version is ready.</span>
      <Button size="xs" variant="outline" onClick={applyPendingUpdate}>
        Reload to update
      </Button>
    </div>
  )
}
