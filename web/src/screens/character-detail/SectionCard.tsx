import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useSectionOpen } from '@/lib/sectionOpen'

/** Shared title + card shell for every section on the character detail
 *  screen. The title folds the section; the choice is remembered on this
 *  device under `id` (the title unless it changes, like a count). */
export function SectionCard({ title, id, defaultOpen = true, children }: { title: string; id?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useSectionOpen(`character:${id ?? title}`, defaultOpen)
  return (
    <section aria-label={title} className="mx-3 my-1.5 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-1 text-left">
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          {title}
        </button>
      </h2>
      {open && <div className="mt-2">{children}</div>}
    </section>
  )
}
