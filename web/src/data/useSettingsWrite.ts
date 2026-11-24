import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { settingsRefusalNotice, type SettingsChange, type SettingsPage } from '@/api/partyApi'
import { useConfigLoaded, usePartyApi, useRefreshDynamicStateNow } from './PartyDataProvider'

// The settings route's client, as the console's settings-write.ts runs it:
// - a control writes only once the config section and the page's settings read have arrived;
// - each write sends the `settingsAt` of the page's `GET /party-api/settings` read as its basis,
//   and the page reads it again after each write;
// - a refused write shows the console's words, and an out-of-date one shows the console's
//   current value with a notice.
const SETTINGS_PAGE = ['settingsPage'] as const

export function useSettingsWrite() {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const configLoaded = useConfigLoaded()
  const page = useQuery({
    queryKey: SETTINGS_PAGE,
    queryFn: async (): Promise<SettingsPage> => {
      const result = await api.getSettingsPage()
      if (result.kind === 'failure') throw new Error(result.message)
      return result.value
    },
    staleTime: Infinity,
  })
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function write(changes: SettingsChange[]): Promise<boolean> {
    setNotice(null)
    setPending(true)
    try {
      const result = await api.writeSettings(changes, page.data?.settingsAt)
      if (result.kind === 'failure') setNotice(settingsRefusalNotice(result.status, result.body, result.message))
      // A saved write and a refused one both read config and core again, so the controls show the
      // console's values.
      await refreshNow()
      return result.kind === 'success'
    } finally {
      setPending(false)
      // The next write's basis is the page's new read.
      void page.refetch()
    }
  }

  // A declared setting from the page's read, with its label and value, for a field with no config
  // field of its own (console settings-write.ts `value`, `declared`).
  const declared = (field: string) => page.data?.settings.find((entry) => entry.field === field)
  const value = (field: string): unknown => declared(field)?.value

  return { ready: configLoaded && page.data !== undefined, write, notice, pending, value, declared }
}
