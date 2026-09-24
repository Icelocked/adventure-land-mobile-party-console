/** One tile within a shared sprite sheet (e.g. items/pack_20vt8.png) - x/y
 *  are grid COLUMN/ROW indices, not pixel offsets. `tileSize` is carried
 *  through because the server sends it, but components/SpriteIcon.tsx
 *  deliberately does NOT use it for crop math: confirmed this session
 *  it's only reliable for item sheets (raw_items.png really is 400x800px,
 *  exactly tileSize=20 * columns=20/rows=40), not for monster sheets
 *  (monster2.png is really 720x512px, while tileSize=1 with columns=12/
 *  rows=8 would imply 12x8). SpriteIcon derives the real tile size from
 *  the loaded image's own natural dimensions divided by columns/rows,
 *  which is correct for both. */
export interface Sprite {
  url: string
  tileSize: number
  columns: number
  rows: number
  x: number
  y: number
}
