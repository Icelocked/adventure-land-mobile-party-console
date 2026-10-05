import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { DungeonView } from '@/models/dungeon'
import { usePartyApi } from './PartyDataProvider'
import { useVisible } from './useMapFrames'

const DUNGEON_KEY = ['party', 'daily-dungeons'] as const

/** Polls GET /daily-dungeons every second while visible. Every POST
 *  carries a fresh operationId and its response replaces the cached view. */
export function useDungeons() {
  const api = usePartyApi()
  const client = useQueryClient()
  const visible = useVisible()
  const query = useQuery({
    queryKey: DUNGEON_KEY,
    queryFn: async () => {
      const result = await api.getJson<DungeonView>('daily-dungeons')
      if (result.kind === 'failure') throw new Error(result.message)
      return result.value
    },
    enabled: visible,
    refetchInterval: 1000,
    staleTime: 1000,
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function action(body: Record<string, unknown>) {
    setError('')
    setBusy(true)
    try {
      const result = await api.post('daily-dungeons', { ...body, operationId: crypto.randomUUID() })
      if (result.kind === 'failure') {
        setError(result.message)
        return false
      }
      if (result.value.data) client.setQueryData(DUNGEON_KEY, result.value.data as unknown as DungeonView)
      return true
    } finally {
      setBusy(false)
    }
  }
  return { ...query, action, busy, actionError: error }
}

export function dungeonCountdown(at: number, now: number) {
  const seconds = Math.max(0, Math.ceil((at - now) / 1000))
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s`
}

export function dungeonEntryLabel(view: DungeonView | undefined, now: number) {
  const member = view?.members[0],
    visit = member?.observation?.visit
  if (!member?.fresh || !visit || now - visit.checkedAt > 45000) return 'Availability unknown'
  if (visit.available) return 'Available now'
  if (visit.resets > now) return `Next entry: ${dungeonCountdown(visit.resets, now)}`
  return 'Checking availability…'
}
