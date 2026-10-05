/** Character doll markup comes from the game's own sprite() for every player
 *  in view - other players' skins and cosmetics included - and is rendered as
 *  HTML. The PWA can be public (Tailscale Funnel), and script running in its
 *  origin could drive the paired console, so the markup is rebuilt from an
 *  allowlist before it touches the DOM: only div/span/img, only the layout
 *  attributes a doll uses, every value re-escaped. Anything else - event
 *  handlers, other tags, script URLs - is dropped, whatever the input. */

const TAGS = new Set(['div', 'span', 'img'])
const ATTRIBUTES = new Set(['style', 'src', 'class', 'width', 'height'])
const VOID = new Set(['img'])

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const decode = (value: string) =>
  value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

function safeUrl(url: string): boolean {
  const trimmed = url.trim()
  return /^https?:\/\//i.test(trimmed) || /^\/\/[^/]/.test(trimmed) || /^\/[^/]/.test(trimmed)
}

function safeStyle(style: string): boolean {
  const lower = style.toLowerCase().replace(/\\/g, '')
  if (/expression\s*\(|javascript:|vbscript:|@import|behavior\s*:|-moz-binding|[<>]/.test(lower)) return false
  // url(...) only to http(s) or the same site.
  for (const match of lower.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g)) if (!safeUrl(match[2])) return false
  return true
}

function attributes(source: string): string {
  let out = ''
  for (const match of source.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    const name = match[1].toLowerCase()
    if (!ATTRIBUTES.has(name)) continue
    const value = decode(match[3] ?? match[4] ?? match[5] ?? '')
    if (name === 'src' && !safeUrl(value)) continue
    if (name === 'style' && !safeStyle(value)) continue
    if ((name === 'width' || name === 'height') && !/^\d{1,5}(px)?$/.test(value.trim())) continue
    out += ` ${name}="${escape(value)}"`
  }
  return out
}

/** Rebuilds doll markup from the allowlist (see the module doc). */
export function sanitizeDollHtml(html: string | null | undefined): string {
  if (!html) return ''
  const open: string[] = []
  let out = ''
  // Tags and the text between them; comments, doctype and processing instructions are dropped.
  const tokens = String(html).replace(/<!--[\s\S]*?-->/g, '').matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</g)
  for (const token of tokens) {
    const [whole, tagName, rest, text] = token
    if (text !== undefined) {
      out += escape(decode(text))
      continue
    }
    if (!tagName) continue // a stray "<"
    const tag = tagName.toLowerCase()
    if (!TAGS.has(tag)) continue
    if (whole.startsWith('</')) {
      const index = open.lastIndexOf(tag)
      if (index < 0) continue
      while (open.length > index) out += `</${open.pop()}>`
      continue
    }
    out += `<${tag}${attributes(rest || '')}>`
    if (!VOID.has(tag) && !/\/\s*$/.test(rest || '')) open.push(tag)
    else if (!VOID.has(tag)) out += `</${tag}>`
  }
  while (open.length) out += `</${open.pop()}>`
  return out
}
