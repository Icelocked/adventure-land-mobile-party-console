import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// The game's item box: black with a 5px gray border (render_item in the game's
// js/html.js). Console: dashboard/features/party/item-card.tsx GameBox.
// A box inside a sheet that already has regions can be a labelled group (a fieldset).
export function GameBox({ label, className, group = false, children }: { label: string; className?: string; group?: boolean; children: ReactNode }) {
  const props = {
    'aria-label': label,
    className: cn('min-w-0 break-words border-[length:5px] border-[color:#808080] bg-black px-4 py-3 text-[13px] leading-5 text-[#E4E4E4]', className),
    style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  }
  return group ? <fieldset {...props}>{children}</fieldset> : <section {...props}>{children}</section>
}

// One "Label: value" line in the game's style, with the label in its color.
export function GameLine({ line, label, value, color, valueColor }: { line: string; label: string; value: ReactNode; color: string; valueColor?: string }) {
  return (
    <div data-line={line}>
      <span data-label style={{ color }}>
        {label}
      </span>
      : <span data-value style={valueColor ? { color: valueColor } : undefined}>{value}</span>
    </div>
  )
}

// A text-only game line, such as "Locked" or an ability's description.
export function GameText({ line, text, color }: { line: string; text: string; color: string }) {
  return (
    <div data-line={line} style={{ color }}>
      {text}
    </div>
  )
}
