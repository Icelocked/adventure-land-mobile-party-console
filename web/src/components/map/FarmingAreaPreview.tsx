import { useEffect, useRef, useState } from 'react'
import { useMapDefinition } from '@/data/useMapFrames'
import type { FarmingArea } from '@/lib/farmingAreas'
import { MapCanvas } from './MapCanvas'

/** The area's map, scaled to fit the spawn
 *  boundary and hunt radius, with the area overlay and waypoint. */
export function FarmingAreaPreview({ area, radius }: { area: FarmingArea; radius: number }) {
  const query = useMapDefinition(area.map)
  const definition = query.data
  const error = query.isError
  const [size, setSize] = useState({ width: 400, height: 320 })
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    if (container.current) observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  const box = area.boundary
  const width = Math.max(radius * 2, box ? box[2] - box[0] : 0) + 120
  const height = Math.max(radius * 2, box ? box[3] - box[1] : 0) + 120
  return (
    <div ref={container} aria-label="Farming area map" className="relative h-full min-h-72 overflow-hidden border-2 border-emerald-700 bg-[#07110f]">
      {definition ? (
        <MapCanvas
          definition={definition}
          frame={{ name: 'Farming area', map: area.map, at: 0, x: area.x, y: area.y, entities: [], events: [] }}
          previous={null}
          receivedAt={0}
          scale={Math.max(0.01, Math.min(size.width / width, size.height / height))}
          detailed={false}
          area={area}
          huntRadius={radius}
        />
      ) : (
        <output className="block p-5 text-emerald-100">{error ? 'Map preview unavailable. You can still choose this area.' : 'Loading map…'}</output>
      )}
    </div>
  )
}
