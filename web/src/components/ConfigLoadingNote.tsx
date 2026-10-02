import { useConfigLoaded } from '@/data/PartyDataProvider'

/** Shown beside any control seeded from the config section while that
 *  section hasn't arrived yet - the control stays disabled until then so it
 *  can't save empty defaults over the server's real values. */
export function ConfigLoadingNote() {
  const loaded = useConfigLoaded()
  if (loaded) return null
  return <p className="mt-1 text-xs text-muted-foreground">Loading settings…</p>
}
