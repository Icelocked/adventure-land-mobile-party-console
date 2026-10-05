"""The app icon: a warrior, mage and ranger on a night hill. Writes the icon
SVGs into this folder; render.cjs turns them into PNGs (see README.md)."""
import os

OUT = os.path.dirname(os.path.abspath(__file__))
INK = '#0c0a24'  # outline colour


def lin(id_, light, dark, x2='1', y2='1'):
    return f'<linearGradient id="{id_}" x1="0" y1="0" x2="{x2}" y2="{y2}"><stop offset="0" stop-color="{light}"/><stop offset="1" stop-color="{dark}"/></linearGradient>'


DEFS = '<defs>' + ''.join([
    lin('sky', '#3b2f8f', '#0a0b22', '.6', '1'),
    '<radialGradient id="aura" cx="50%" cy="62%" r="50%"><stop offset="0" stop-color="#8b9cff" stop-opacity=".55"/><stop offset="1" stop-color="#8b9cff" stop-opacity="0"/></radialGradient>',
    '<radialGradient id="vignette" cx="50%" cy="45%" r="70%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>',
    lin('hill', '#2f3f8a', '#141a45', '0', '1'),
    '<radialGradient id="hillLight" cx="45%" cy="20%" r="60%"><stop offset="0" stop-color="#a5b4fc" stop-opacity=".45"/><stop offset="1" stop-color="#a5b4fc" stop-opacity="0"/></radialGradient>',
    lin('war', '#fb7185', '#b91c1c'),
    lin('warDark', '#991b1b', '#5f0f0f'),
    lin('mag', '#c4b5fd', '#7c3aed'),
    lin('magDark', '#6d28d9', '#3b0b8a'),
    lin('ran', '#4ade80', '#15803d'),
    lin('ranDark', '#166534', '#0a3d1f'),
    lin('skin', '#fde3c4', '#e7b07c'),
    lin('steel', '#f1f5f9', '#64748b'),
    lin('blade', '#ffffff', '#94a3b8', '1', '0'),
    lin('gold', '#fde68a', '#d97706'),
    lin('hat', '#7c3aed', '#2e1065'),
    lin('wood', '#b45309', '#5a2a07'),
    '<radialGradient id="orb" cx="40%" cy="35%" r="65%"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#a5f3fc"/><stop offset="1" stop-color="#0891b2"/></radialGradient>',
    '<radialGradient id="orbGlow"><stop offset="0" stop-color="#67e8f9" stop-opacity=".85"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>',
    '<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".38" stop-color="#fff" stop-opacity="0"/></linearGradient>',
]) + '</defs>'

O = f'stroke="{INK}" stroke-width="7" stroke-linejoin="round"'


def eyes(x, y, gap=13):
    return f'<circle cx="{x - gap}" cy="{y}" r="5" fill="{INK}"/><circle cx="{x + gap}" cy="{y}" r="5" fill="{INK}"/>'


def party():
    return f'''
  <!-- ground -->
  <ellipse cx="256" cy="452" rx="250" ry="70" fill="url(#hill)"/>
  <ellipse cx="256" cy="452" rx="250" ry="70" fill="url(#hillLight)"/>
  <ellipse cx="256" cy="436" rx="190" ry="18" fill="#000" opacity=".35"/>

  <!-- mage's staff, behind the ranger -->
  <rect x="318" y="168" width="13" height="270" rx="6" fill="url(#wood)" {O}/>
  <circle cx="324" cy="150" r="44" fill="url(#orbGlow)"/>
  <circle cx="324" cy="150" r="21" fill="url(#orb)" {O}/>
  <circle cx="317" cy="143" r="6" fill="#fff" opacity=".9"/>

  <!-- ranger, right -->
  <path d="M332 434 C332 350 350 306 382 302 C414 306 434 350 434 434 Z" fill="url(#ran)" {O}/>
  <path d="M398 304 C420 314 434 352 434 434 L398 434 Z" fill="#000" opacity=".22"/>
  <path d="M382 302 C370 302 360 306 354 314 L382 364 L410 314 C404 306 394 302 382 302 Z" fill="url(#ranDark)"/>
  <rect x="340" y="378" width="88" height="12" rx="5" fill="url(#wood)"/>
  <circle cx="382" cy="256" r="38" fill="url(#skin)" {O}/>
  {eyes(382, 262, 12)}
  <path d="M382 198 C422 206 436 250 426 288 C418 266 404 252 382 252 C360 252 346 266 338 288 C328 250 342 206 382 198 Z" fill="url(#ranDark)" {O}/>
  <path d="M382 206 C362 212 350 232 348 254 C356 240 366 232 382 230 Z" fill="#fff" opacity=".18"/>
  <path d="M448 226 C490 274 490 356 448 404" fill="none" stroke="{INK}" stroke-width="20" stroke-linecap="round"/>
  <path d="M448 226 C490 274 490 356 448 404" fill="none" stroke="url(#wood)" stroke-width="11" stroke-linecap="round"/>
  <path d="M448 226 L448 404" stroke="#fef3c7" stroke-width="3"/>

  <!-- warrior, left -->
  <path d="M60 336 L50 164 L62 120 L74 164 L68 336 Z" fill="url(#blade)" {O}/>
  <path d="M62 128 L66 330" stroke="#fff" stroke-width="3" opacity=".8"/>
  <rect x="36" y="330" width="52" height="15" rx="7" fill="url(#gold)" {O}/>
  <rect x="56" y="344" width="13" height="40" rx="5" fill="url(#warDark)" {O}/>
  <path d="M78 434 C78 350 98 306 130 302 C162 306 182 350 182 434 Z" fill="url(#war)" {O}/>
  <path d="M146 304 C168 314 182 352 182 434 L146 434 Z" fill="#000" opacity=".22"/>
  <rect x="86" y="326" width="88" height="16" rx="6" fill="url(#warDark)"/>
  <rect x="122" y="324" width="18" height="20" rx="4" fill="url(#gold)"/>
  <circle cx="130" cy="256" r="38" fill="url(#skin)" {O}/>
  {eyes(130, 266, 12)}
  <path d="M88 258 C88 216 106 196 130 196 C154 196 172 216 172 258 L162 258 L162 240 L98 240 L98 258 Z" fill="url(#steel)" {O}/>
  <path d="M104 228 C106 214 116 206 128 204" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>
  <path d="M130 176 C146 172 156 186 152 198 L108 198 C104 186 114 172 130 176 Z" fill="url(#gold)" {O}/>

  <!-- mage, front centre -->
  <path d="M180 444 C186 344 218 300 256 296 C294 300 326 344 332 444 Z" fill="url(#mag)" {O}/>
  <path d="M276 300 C306 314 326 352 332 444 L276 444 Z" fill="#000" opacity=".2"/>
  <path d="M256 296 C246 296 238 300 232 306 L256 356 L280 306 C274 300 266 296 256 296 Z" fill="url(#magDark)"/>
  <path d="M256 360 L256 440" stroke="url(#gold)" stroke-width="7"/>
  <circle cx="256" cy="250" r="46" fill="url(#skin)" {O}/>
  {eyes(256, 258, 15)}
  <path d="M232 278 C244 286 268 286 280 278" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round" opacity=".6"/>
  <path d="M186 226 C222 212 290 212 326 226 C302 202 290 150 282 60 C266 96 232 160 186 226 Z" fill="url(#hat)" {O}/>
  <path d="M276 84 C268 120 246 172 214 214 C238 186 262 140 276 84 Z" fill="#fff" opacity=".18"/>
  <ellipse cx="256" cy="226" rx="92" ry="18" fill="url(#hat)" {O}/>
  <path d="M222 206 L230 192 L238 206 L252 208 L242 216 L244 230" fill="none"/>
  <circle cx="270" cy="134" r="8" fill="url(#gold)" {O}/>
'''


def stars():
    pts = [(70, 70, 3), (130, 40, 2), (420, 60, 3), (460, 120, 2), (200, 30, 2), (380, 30, 2), (40, 150, 2), (470, 190, 2)]
    return ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff" opacity=".85"/>' for x, y, r in pts)


def icon(size, shape='rounded', sheen=True, dev=False):
    clip = '<rect width="512" height="512" rx="112"/>' if shape == 'rounded' else '<circle cx="256" cy="256" r="256"/>'
    art = party() if shape == 'rounded' else f'<g transform="translate(40 44) scale(.84)">{party()}</g>'
    dev_mark = ('<g><rect x="300" y="404" width="172" height="70" rx="22" fill="#f59e0b" stroke="#0c0a24" stroke-width="8"/>'
                '<text x="386" y="452" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="44" text-anchor="middle" fill="#0c0a24">DEV</text></g>') if dev else ''
    cid = f'clip{size}{shape}{int(dev)}'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 512 512">{DEFS}
<clipPath id="{cid}">{clip}</clipPath><g clip-path="url(#{cid})">
<rect width="512" height="512" fill="url(#sky)"/>{stars()}<rect width="512" height="512" fill="url(#aura)"/>{art}
<rect width="512" height="512" fill="url(#vignette)"/>{'<rect width="512" height="512" fill="url(#sheen)"/>' if sheen else ''}</g>{dev_mark}</svg>'''


BADGE = '''<svg xmlns="http://www.w3.org/2000/svg" width="{s}" height="{s}" viewBox="0 0 512 512"><g fill="{f}">
<path d="M300 446 C300 346 330 300 376 296 C422 300 448 346 448 446 Z"/><circle cx="376" cy="238" r="58"/>
<path d="M64 446 C64 346 90 300 136 296 C182 300 212 346 212 446 Z"/><circle cx="136" cy="238" r="58"/>
<path d="M156 466 C162 344 204 296 256 292 C308 296 350 344 356 466 Z"/><circle cx="256" cy="232" r="66"/>
<path d="M164 210 C212 192 300 192 348 210 C318 186 294 124 270 34 C256 74 214 150 164 210 Z"/></g></svg>'''

# ---- layers for app assets ------------------------------------------------
GROUND = '''
  <ellipse cx="256" cy="452" rx="250" ry="70" fill="url(#hill)"/>
  <ellipse cx="256" cy="452" rx="250" ry="70" fill="url(#hillLight)"/>'''


def characters():
    """The party without its hill, for a foreground layer."""
    art = party()
    start = art.index('<ellipse cx="256" cy="436"')
    return art[start:]


def background_layer(with_ground=True):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{DEFS}
<rect width="512" height="512" fill="url(#sky)"/>{stars()}<rect width="512" height="512" fill="url(#aura)"/>{GROUND if with_ground else ''}
<rect width="512" height="512" fill="url(#vignette)"/></svg>'''


def foreground_layer(scale, dev=False, dy=0):
    off = 256 - 256 * scale
    # Bottom centre, inside the circle every launcher mask keeps.
    tag = ('<g><rect x="196" y="350" width="120" height="50" rx="16" fill="#f59e0b" stroke="#0c0a24" stroke-width="6"/>'
           '<text x="256" y="385" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="31" text-anchor="middle" fill="#0c0a24">DEV</text></g>') if dev else ''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{DEFS}
<g transform="translate({off} {off + dy}) scale({scale})">{characters()}</g>{tag}</svg>'''


def full_bleed(scale, dev=False):
    """Square icon with no transparency: background plus scaled party."""
    off = 256 - 256 * scale
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{DEFS}
<rect width="512" height="512" fill="url(#sky)"/>{stars()}<rect width="512" height="512" fill="url(#aura)"/>
<g transform="translate({off} {off}) scale({scale})">{party()}</g>
<rect width="512" height="512" fill="url(#vignette)"/></svg>'''


def monochrome(scale, fill='#fff'):
    off = 256 - 256 * scale
    inner = BADGE.format(s=512, f=fill).split('>', 1)[1].rsplit('</svg>', 1)[0]
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate({off} {off}) scale({scale})">{inner}</g></svg>'


def write_layers():
    files = {
        'rounded.svg': icon(512),
        'maskable.svg': full_bleed(0.80),
        'apple.svg': full_bleed(0.92),
        'android-bg.svg': background_layer(),
        'android-fg.svg': foreground_layer(0.66, dy=8),
        'android-fg-dev.svg': foreground_layer(0.66, dev=True, dy=8),
        'android-mono.svg': monochrome(0.56),
        'badge-white.svg': monochrome(1.0),
    }
    for name, svg in files.items():
        open(os.path.join(OUT, name), 'w', encoding='utf-8').write(svg)
    return list(files)


if __name__ == '__main__':
    print('wrote', ', '.join(write_layers()))
