import { useEffect, useState } from 'react'
import { mapStreamUrl } from '@/config/serverConfig'
import { useDynamicState, usePartyApi, useServerSettings } from './PartyDataProvider'
import type { MapDefinition, MapFrame } from '@/components/map/mapTypes'

type Listener = { frame: (frame: MapFrame) => void; state?: (state: 'live' | 'reconnecting') => void }

/** One EventSource per character's map stream
 *  (runtime/coordinator/telemetry/map-stream.ts), shared by every
 *  subscriber - the live map and the target-type lookup - and closed when
 *  the last one leaves. */
const streams = new Map<string, { source: EventSource; listeners: Set<Listener> }>()

export function subscribeMapFrames(url: string, listener: Listener): () => void {
  let stream = streams.get(url)
  if (!stream) {
    const source = new EventSource(url)
    const created = { source, listeners: new Set<Listener>() }
    source.onopen = () => created.listeners.forEach((entry) => entry.state?.('live'))
    source.onerror = () => created.listeners.forEach((entry) => entry.state?.('reconnecting'))
    source.onmessage = (event) => {
      let frame: MapFrame
      try {
        frame = JSON.parse(event.data) as MapFrame
      } catch {
        return
      }
      created.listeners.forEach((entry) => entry.frame(frame))
    }
    streams.set(url, created)
    stream = created
  } else if (stream.source.readyState === EventSource.OPEN) {
    listener.state?.('live')
  }
  stream.listeners.add(listener)
  const owned = stream
  return () => {
    owned.listeners.delete(listener)
    if (!owned.listeners.size) {
      owned.source.close()
      streams.delete(url)
    }
  }
}

/** Subscribes [listener] to [character]'s map frames while [enabled]. */
export function useMapFrames(character: string, enabled: boolean, listener: Listener) {
  const settings = useServerSettings()
  useEffect(() => {
    if (!enabled) return
    return subscribeMapFrames(mapStreamUrl(settings, character), listener)
    // The listener is expected to be stable for a given character.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, character, enabled])
}

/** query-cache.tsx useVisible: the document is visible. */
export function useVisible() {
  const [visible, setVisible] = useState(() => typeof document !== 'undefined' && !document.hidden)
  useEffect(() => {
    const change = () => setVisible(!document.hidden)
    change()
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])
  return visible
}

// query-cache.tsx useMapDefinition: keyed by core's referenceRevision, kept for the session.
const definitions = new Map<string, Promise<MapDefinition | null>>()

export function useMapDefinition(map: string, enabled = true) {
  const api = usePartyApi()
  const revision = String(useDynamicState().referenceRevision || '0')
  const visible = useVisible()
  const [data, setData] = useState<MapDefinition | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    if (!visible || !enabled || !map) return
    const key = `${revision}:${map}`
    let request = definitions.get(key)
    if (!request) {
      const path = `maps/${encodeURIComponent(map)}?revision=${revision}`
      // query-cache.tsx transientRetry: one retry after 1 s for network, 408, 429 and 5xx failures.
      const transient = (status?: number) => status === undefined || status >= 500 || status === 408 || status === 429
      request = api.getJson<MapDefinition>(path).then(async (first) => {
        let result = first
        if (result.kind === 'failure' && transient(result.status)) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          result = await api.getJson<MapDefinition>(path)
        }
        if (result.kind === 'failure') {
          definitions.delete(key)
          return null
        }
        return result.value
      })
      definitions.set(key, request)
    }
    let cancelled = false
    void request.then((value) => {
      if (cancelled) return
      if (value) setData(value)
      else setFailed(key)
    })
    return () => {
      cancelled = true
    }
  }, [api, revision, map, enabled, visible])
  return { data: data?.name === map ? data : null, isError: failed === `${revision}:${map}` }
}
