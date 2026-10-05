import { describe, expect, it } from 'vitest'
import { sanitizeDollHtml } from './safeHtml'

// The shape the game's sprite() returns for a character doll (dashboardDollHtml
// rewrites image URLs to adventure.land): clipping divs around offset images.
const doll =
  '<div style="position: relative; display: inline-block; width: 54px; height: 76px; overflow: hidden">' +
  '<div style="position: absolute; left: 0px; bottom: 0px; width: 54px; height: 76px; overflow: hidden">' +
  "<img style='max-width: none; image-rendering: pixelated; width: 208px; height: 304px; margin-left: -54px; margin-top: 0px' src='https://adventure.land/images/cosmetics/hair.png?v=17478&amp;x=1'>" +
  '</div></div>'

describe('sanitizeDollHtml (lib/safeHtml.ts)', () => {
  it('keeps a real doll intact: layout styles, image URL and nesting', () => {
    const out = sanitizeDollHtml(doll)
    expect(out).toContain('position: absolute; left: 0px; bottom: 0px; width: 54px')
    expect(out).toContain('src="https://adventure.land/images/cosmetics/hair.png?v=17478&amp;x=1"')
    expect(out).toContain('margin-left: -54px')
    expect(out.match(/<div/g)).toHaveLength(2)
    expect(out.match(/<\/div>/g)).toHaveLength(2)
  })

  it('drops event handlers, scripts, foreign tags and script URLs', () => {
    const attacks = [
      '<img src="x" onerror="alert(1)">',
      '<img src=x onerror=alert(1)>',
      '<div onmouseover="steal()">a</div>',
      '<script>alert(1)</script>',
      '<svg onload=alert(1)><circle/></svg>',
      '<iframe src="https://evil.example"></iframe>',
      '<img src="javascript:alert(1)">',
      '<img src=" JaVaScRiPt:alert(1)">',
      '<div style="background:url(javascript:alert(1))">a</div>',
      '<div style="width: expression(alert(1))">a</div>',
      '<a href="https://evil.example">link</a>',
      '<img src="data:image/svg+xml,<svg onload=alert(1)>">',
      '<div style="x" onclick="a()" style2="y">a</div>',
      '<img/src=x/onerror=alert(1)>',
      '<<img src=x onerror=alert(1)>',
      '<div title="&quot; onclick=&quot;alert(1)">a</div>',
    ]
    for (const attack of attacks) {
      const out = sanitizeDollHtml(attack)
      expect(out, attack).not.toMatch(/on[a-z]+\s*=/i)
      expect(out, attack).not.toMatch(/<(script|svg|iframe|a)\b/i)
      expect(out, attack).not.toMatch(/javascript:|expression\(|data:/i)
    }
  })

  it('escapes text and attribute values so nothing can break out of an attribute', () => {
    expect(sanitizeDollHtml('<div style=\'width:1px" onclick="x\'>a<b>c</div>')).toBe('<div style="width:1px&quot; onclick=&quot;x">ac</div>')
    expect(sanitizeDollHtml('<span>&lt;img onerror=x&gt;</span>')).toBe('<span>&lt;img onerror=x&gt;</span>')
  })

  it('closes unclosed tags and ignores stray closers', () => {
    expect(sanitizeDollHtml('<div><span>a')).toBe('<div><span>a</span></div>')
    expect(sanitizeDollHtml('</div>a</span>')).toBe('a')
    expect(sanitizeDollHtml(null)).toBe('')
  })
})
