import { Link } from 'react-router-dom'
import { FileWarning } from 'lucide-react'
import { useDiagnosticsAlerts } from '@/data/useDiagnostics'

/** The party header's Diagnostics button, always there (console diagnostics-dialog.tsx
 *  DiagnosticsButton). Its badge counts the unread alerts and sits on the corner, so a count
 *  changes no width in the header row. */
export function DiagnosticsButton() {
  const unread = useDiagnosticsAlerts().unread.length
  const tone = unread ? 'border-amber-500 bg-amber-950 text-amber-200' : 'border-border text-muted-foreground'
  return (
    <Link
      to="/diagnostics"
      aria-label={unread ? `Diagnostics, ${unread} unread` : 'Diagnostics'}
      title={unread ? `Diagnostics: ${unread} unread` : 'Diagnostics'}
      className={`relative inline-flex size-8 items-center justify-center rounded-full border ${tone}`}
    >
      <FileWarning className="size-4" />
      {unread ? (
        <span data-unread className="absolute -right-2 -top-2 min-w-4 rounded-full border border-amber-500 bg-amber-950 px-1 text-center font-mono text-[10px] leading-4 text-amber-200">
          {unread}
        </span>
      ) : null}
    </Link>
  )
}
