import { useDebugBrowser, useDebugGameUrl } from '@/data/useDebugBrowser'

/** debug-browser.tsx DebugBrowserBanner: on a debug instance, a banner with the game client link. */
export function DebugBrowserBanner() {
  const debug = useDebugBrowser()
  const href = useDebugGameUrl()
  if (!debug) return null
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 border-b border-cyan-800 px-4 py-3 text-sm text-cyan-100">
      <span>Debug instance · god party · unlimited Cave visits</span>
      <a className="rounded border border-cyan-500 px-3 py-2" href={href} target="_blank" rel="noreferrer">
        Open game client
      </a>
      <span className="text-slate-300">View and control the running browser. Closing its viewer keeps the party running.</span>
    </div>
  )
}
