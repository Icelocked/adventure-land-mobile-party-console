import { useQuery, useQueryClient } from '@tanstack/react-query'
import { emptySlots, type AddonsReply } from '@/models'
import { usePartyApi } from './PartyDataProvider'

// The add-on list, read once per page as the dashboard's slots.tsx `load` does. A change of an
// add-on's switch, settings or stores reads it again (`useReloadAddons`).
export const ADDONS_KEY = ['addons'] as const

export function useAddons(): AddonsReply & { loaded: boolean; error: string } {
  const api = usePartyApi()
  const query = useQuery({
    queryKey: ADDONS_KEY,
    queryFn: async (): Promise<AddonsReply> => {
      const result = await api.getAddons()
      if (result.kind === 'failure') throw new Error(result.message)
      return result.value
    },
    staleTime: Infinity,
    retry: false,
  })
  const value = query.data
  return {
    addons: value?.addons ?? [],
    slots: { ...emptySlots(), ...value?.slots },
    rings: value?.rings ?? [],
    overlays: value?.overlays ?? {},
    refusals: value?.refusals ?? [],
    stores: value?.stores ?? {},
    loaded: query.isFetched,
    // The dashboard's words for a failed read (slots.tsx `load`).
    error: query.error ? `Add-ons are unavailable: ${query.error.message}` : '',
  }
}

export function useReloadAddons(): () => Promise<void> {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: ADDONS_KEY })
}
