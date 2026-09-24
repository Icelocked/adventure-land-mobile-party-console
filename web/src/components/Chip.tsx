import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** A toggleable pill button - the web equivalent of Material3's
 *  FilterChip, used throughout (formation toggles, item-detail tabs,
 *  stat-scroll picks). */
export function Chip({ selected, onClick, children, disabled }: { selected: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full border px-3 py-1 text-sm transition disabled:opacity-50',
        selected ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:border-primary/40',
      )}
    >
      {children}
    </button>
  )
}
