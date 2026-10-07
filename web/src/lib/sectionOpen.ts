import { useCallback, useState } from 'react'

// Which sections are folded, kept on this device. One entry per kind of
// section (not per character), so folding Equipment folds it everywhere.
const KEY = 'party-section-open'

function saved(): Record<string, boolean> {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

/** Whether the section `id` is open: the last choice on this device, else `defaultOpen`. */
export function useSectionOpen(id: string, defaultOpen = true): [boolean, (open: boolean) => void] {
  const [open, setOpenState] = useState(() => saved()[id] ?? defaultOpen)
  const setOpen = useCallback(
    (value: boolean) => {
      setOpenState(value)
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...saved(), [id]: value }))
      } catch {
        // Storage unavailable: the choice lasts until the page closes.
      }
    },
    [id],
  )
  return [open, setOpen]
}
