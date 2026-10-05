import { useEffect, useState } from 'react'
import { usePartyApi } from '@/data/PartyDataProvider'

/** The update service's status; only the fields the PWA reads. */
export interface ConsoleUpdateStatus {
  current?: string
  displayVersion?: string
  // The available release's version.
  available?: string | boolean
  notes?: string
  automatic?: boolean
  managed?: boolean
  phase?: string
  checkedAt?: number
  error?: string
  [field: string]: unknown
}

/** The update service's status, re-read every 3s. */
export function useConsoleUpdates() {
  const api = usePartyApi()
  const [state, setState] = useState<ConsoleUpdateStatus | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    const refresh = async () => {
      const result = await api.getRoot('console-update')
      if (!alive) return
      if (result.kind === 'failure') return setError('Update service is starting or unavailable.')
      try {
        setState(JSON.parse(result.value) as ConsoleUpdateStatus)
        setError('')
      } catch {
        setError('Update service is starting or unavailable.')
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 3000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [api])
  return { state, error }
}
