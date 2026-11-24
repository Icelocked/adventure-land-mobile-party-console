import { usePinTopBar } from '@/lib/pinTopBar'

/** "Pin top bar" in Account > Display (console pin-top-bar.tsx PinTopBarSetting). */
export function PinTopBarSetting() {
  const [pinned, setPinned] = usePinTopBar()
  return (
    <section data-area="display" aria-label="Display" className="space-y-2 rounded border border-border p-4 text-sm">
      <h3 className="font-semibold">Display</h3>
      <label className="flex items-center gap-3">
        <input type="checkbox" className="size-4 accent-emerald-500" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
        Pin top bar
      </label>
      <p className="text-muted-foreground">Keeps the top bar and each character card&apos;s name strip in view while the page scrolls.</p>
    </section>
  )
}
