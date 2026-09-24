import type { ReactNode } from 'react'

/** Shared shell for every scrollable-body section on the character
 *  detail screen - ported from ui/characterdetail/sections/
 *  SectionCard.kt: one consistent title + card look. */
export function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-3 my-1.5 rounded-lg border border-border bg-card p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}
