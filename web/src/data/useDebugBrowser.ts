import { useQuery } from '@tanstack/react-query'
import { usePartyApi, useServerSettings } from './PartyDataProvider'

const DEBUG_GAME_PATH = '/debug-game/vnc.html?autoconnect=1&resize=scale&path=debug-game/websockify'

/** Whether this console is a debug instance (read once). */
export function useDebugBrowser() {
  const api = usePartyApi()
  return (
    useQuery({
      queryKey: ['debug-browser'],
      staleTime: Infinity,
      queryFn: async () => {
        const result = await api.consoleDebug()
        if (result.kind === 'failure') return false
        try {
          return (JSON.parse(result.value) as { insideDebug?: boolean }).insideDebug === true
        } catch {
          return false
        }
      },
    }).data === true
  )
}

/** The debug game client's address on this console. */
export function useDebugGameUrl() {
  const settings = useServerSettings()
  return `${settings.baseUrl.replace(/\/+$/, '')}${DEBUG_GAME_PATH}`
}
