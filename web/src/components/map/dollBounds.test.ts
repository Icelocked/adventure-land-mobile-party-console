import { describe, expect, it } from 'vitest'
import { dollOuterBox } from './mapRendering'

// Console 1.5 map-canvas.tsx:249-256 and doll-layers.tsx outerWidth/outerHeight.
describe('dollOuterBox', () => {
  it('centres the doll on its outer width and stands it on its outer height', () => {
    expect(dollOuterBox(100, 200, [{ outerWidth: 40, outerHeight: 60 }])).toEqual({ left: 80, top: 140, height: 60 })
  })
  it('falls back to the 27 x 38 native doll when the HTML gives no size', () => {
    expect(dollOuterBox(100, 200, [])).toEqual({ left: 86.5, top: 162, height: 38 })
    expect(dollOuterBox(100, 200, [{ outerWidth: 0, outerHeight: 0 }])).toEqual({ left: 86.5, top: 162, height: 38 })
  })
})
