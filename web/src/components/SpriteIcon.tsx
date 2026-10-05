import { useEffect, useState } from 'react'
import type { Sprite } from '@/models'
import { cn } from '@/lib/utils'

/** Renders one tile of a shared sprite sheet as a fixed-size icon via a CSS
 *  background crop.
 *
 *  Tile size comes from the loaded image's natural dimensions divided by
 *  columns/rows, not Sprite.tileSize, which is unreliable for monster
 *  sheets (see models/sprite.ts). */

// Shared across every icon using the same sheet URL, so opening a screen
// with 30 items from the same sheet only loads its natural size once.
const naturalSizeCache = new Map<string, Promise<{ width: number; height: number }>>()

function loadNaturalSize(url: string): Promise<{ width: number; height: number }> {
  let cached = naturalSizeCache.get(url)
  if (!cached) {
    cached = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error(`Failed to load sprite sheet: ${url}`))
      img.src = url
    })
    naturalSizeCache.set(url, cached)
  }
  return cached
}

export function SpriteIcon({ sprite, size = 40, className }: { sprite?: Sprite | null; size?: number; className?: string }) {
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    setNatural(null)
    if (!sprite) return
    let cancelled = false
    loadNaturalSize(sprite.url)
      .then((dims) => {
        if (!cancelled) setNatural(dims)
      })
      .catch(() => {
        // Sheet failed to load (network hiccup, dead URL): stay a blank
        // tile rather than throwing.
      })
    return () => {
      cancelled = true
    }
  }, [sprite?.url])

  const style: React.CSSProperties = { width: size, height: size }
  if (sprite && natural && sprite.columns > 0 && sprite.rows > 0) {
    const tileWidth = natural.width / sprite.columns
    const tileHeight = natural.height / sprite.rows
    const scaleX = size / tileWidth
    const scaleY = size / tileHeight
    style.backgroundImage = `url(${sprite.url})`
    style.backgroundSize = `${natural.width * scaleX}px ${natural.height * scaleY}px`
    style.backgroundPosition = `${-sprite.x * tileWidth * scaleX}px ${-sprite.y * tileHeight * scaleY}px`
    style.backgroundRepeat = 'no-repeat'
  }

  return <div className={cn('shrink-0 rounded-md bg-muted', className)} style={style} />
}
