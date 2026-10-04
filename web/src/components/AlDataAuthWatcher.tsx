import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { QK } from '@/data/queryKeys'
import { useAlDataAuthPending, usePartyApi } from '@/data/PartyDataProvider'
import { useVisible } from '@/data/useMapFrames'

/** use-party-console.tsx's aldata-auth query: while the ALData auth mail is
 *  pending, /aldata/auth is re-read every 15 s wherever the user is, until
 *  CORRECT. Mounted once for the whole app; renders nothing. */
export function AlDataAuthWatcher() {
  const api = usePartyApi()
  const client = useQueryClient()
  const pending = useAlDataAuthPending()
  const visible = useVisible()
  useEffect(() => {
    if (!pending || !visible) return
    let alive = true
    const check = async () => {
      const result = await api.checkAlDataAuth()
      if (!alive) return
      client.setQueryData(QK.aldataAuthStatus, result.kind === 'success' ? result.value : 'unknown')
      if (result.kind === 'success' && result.value === 'CORRECT') client.setQueryData(QK.aldataAuthPending, false)
    }
    void check()
    const timer = setInterval(() => void check(), 15000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [pending, visible, api, client])
  return null
}
