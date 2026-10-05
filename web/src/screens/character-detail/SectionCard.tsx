import type { ReactNode } from 'react'

/** Shared title + card shell for every section on the character detail
 *  screen. */
export function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="mx-3 my-1.5 rounded-lg border border-border bg-card p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}
