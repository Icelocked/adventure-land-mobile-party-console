import { useQuery, useQueryClient } from '@tanstack/react-query'
import { emptySlots, type AddonsReply } from '@/models'
import type { ApiResult } from '@/api/partyApi'
import { usePartyApi } from './PartyDataProvider'

// The core poll's period while the live stream is up (PartyDataProvider cadences).
const CORE_POLL_MS = 5_000

// The add-on list, read once per page as the dashboard's slots.tsx `load` does. A change of an
// add-on's switch, settings or stores reads it again (`useReloadAddons`).
export const ADDONS_KEY = ['addons'] as const

export function useAddons(): Required<AddonsReply> & { loaded: boolean; error: string } {
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
    reads: value?.reads ?? {},
    loaded: query.isFetched,
    // The dashboard's words for a failed read (slots.tsx `load`).
    error: query.error ? `Add-ons are unavailable: ${query.error.message}` : '',
  }
}

export function useReloadAddons(): () => Promise<void> {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: ADDONS_KEY })
}

/** Whether the named add-on is installed and switched on. */
export function useAddonEnabled(name: string): boolean {
  return useAddons().addons.some((addon) => addon.name === name && addon.enabled)
}

const unwrap = async <T,>(pending: Promise<ApiResult<T>>): Promise<T> => {
  const result = await pending
  if (result.kind === 'failure') throw new Error(result.message)
  return result.value
}

/** The add-on writes a piece makes, each throwing the console's refusal. A switch, a setting or a
 *  store write reloads the list for every reader, as slots.tsx `reloadAddons` does; a command
 *  resolves on the coordinator's answer. */
export function useAddonWrites() {
  const api = usePartyApi()
  const reload = useReloadAddons()
  return {
    save: async (name: string, body: { enabled?: boolean; settings?: Record<string, unknown> }) => {
      await unwrap(api.saveAddon(name, body))
      await reload()
    },
    farming: (name: string, character: string, body: Record<string, unknown>) => unwrap(api.addonFarming(name, character, body)),
    command: (name: string, character: string | undefined, body: unknown) => unwrap(api.addonCommand(name, character, body)),
    store: async (name: string, key: string, patch: Record<string, unknown>) => {
      await unwrap(api.addonStore(name, key, patch))
      await reload()
    },
    reload,
  }
}

/** One coordinator read an add-on asks (GET /addon-read), asked again on the core poll's period,
 *  as slots.tsx `dashboardRead` asks it again on each core read. */
export function useAddonRead<T>(name: string, args: readonly unknown[], enabled = true): T | null | undefined {
  const api = usePartyApi()
  const query = useQuery({
    queryKey: ['addon-read', name, JSON.stringify(args)],
    queryFn: async () => (await unwrap(api.addonRead<T>(name, args))).value ?? null,
    enabled,
    refetchInterval: CORE_POLL_MS,
    retry: false,
    placeholderData: (previous) => previous,
  })
  return query.data
}
