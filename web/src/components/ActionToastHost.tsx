import { useEffect, useState } from 'react'
import { subscribeActionToasts, type ActionToastEntry } from '@/lib/actionToast'

const LABEL: Record<ActionToastEntry['status'], string> = {
  sending: 'Sending…',
  sent: 'Sent',
  failed: 'Failed to send',
}
const STYLE: Record<ActionToastEntry['status'], string> = {
  sending: 'border-border bg-card text-muted-foreground',
  sent: 'border-emerald-600 bg-emerald-950/80 text-emerald-200',
  failed: 'border-destructive bg-destructive/15 text-destructive',
}

/** One stacked pill per in-flight (or just-resolved) command, mounted once
 *  near the app root - see lib/actionToast.ts for why this is a plain
 *  subscription rather than route through React context. */
export function ActionToastHost() {
  const [entries, setEntries] = useState<ActionToastEntry[]>([])
  useEffect(() => subscribeActionToasts(setEntries), [])
  if (entries.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[100] flex flex-col items-center gap-1.5 px-3">
      {entries.map((entry) => (
        // Deliberately generic, even on failure: the acting screen's inline
        // error already shows the real message.
        <div key={entry.id} className={`rounded-full border px-3 py-1 text-xs font-medium shadow-lg ${STYLE[entry.status]}`}>
          {LABEL[entry.status]}
        </div>
      ))}
    </div>
  )
}
