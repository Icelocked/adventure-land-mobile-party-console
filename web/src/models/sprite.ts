/** One tile in a shared sprite sheet; x/y are column/row indices, not
 *  pixels. `tileSize` is unreliable for monster sheets (monster2.png is
 *  720x512 but reports tileSize=1), so SpriteIcon derives the tile size
 *  from the image's natural size divided by columns/rows instead. */
export interface Sprite {
  url: string
  tileSize: number
  columns: number
  rows: number
  x: number
  y: number
}
