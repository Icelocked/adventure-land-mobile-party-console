import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'

/** Shared shell for every account-wide screen (mail/bestiary/skills/
 *  stand/market/bank/logs/settings/catalog) - ported from ui/account/
 *  AccountScreenScaffold.kt: same title bar + back + optional refresh
 *  button, so each screen only supplies its own list/content body. */
export function AccountScreenScaffold({ title, onRefresh, children }: { title: string; onRefresh?: () => void; children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <button onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="size-5" />
        </button>
        <span className="font-medium">{title}</span>
        {onRefresh ? (
          <button onClick={onRefresh} aria-label="Refresh">
            <RefreshCw className="size-4" />
          </button>
        ) : (
          <span className="size-5" />
        )}
      </header>
      <div className="flex-1 pb-6">{children}</div>
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return <p className="p-6 text-sm text-muted-foreground">{message}</p>
}
