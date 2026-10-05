// Rasterises the icon SVGs into every size both apps use.
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const A = __dirname
const WEB = path.join(__dirname, '..')
const RES = path.join(__dirname, '../../app/src/main/res')
const DEBUG_RES = path.join(__dirname, '../../app/src/debug/res')
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }

const jobs = [
  ['rounded.svg', 192, `${WEB}/public/icons/icon-192.png`],
  ['rounded.svg', 512, `${WEB}/public/icons/icon-512.png`],
  ['maskable.svg', 512, `${WEB}/public/icons/icon-maskable-512.png`],
  ['apple.svg', 180, `${WEB}/public/apple-touch-icon.png`],
  ['badge-white.svg', 96, `${WEB}/public/icons/badge-96.png`],
]
for (const [density, factor] of Object.entries(DENSITIES)) {
  const launcher = Math.round(108 * factor)
  jobs.push(['android-bg.svg', launcher, `${RES}/mipmap-${density}/ic_launcher_background.png`])
  jobs.push(['android-fg.svg', launcher, `${RES}/mipmap-${density}/ic_launcher_foreground.png`])
  jobs.push(['android-mono.svg', launcher, `${RES}/mipmap-${density}/ic_launcher_monochrome.png`])
  jobs.push(['android-fg-dev.svg', launcher, `${DEBUG_RES}/mipmap-${density}/ic_launcher_foreground.png`])
  jobs.push(['badge-white.svg', Math.round(24 * factor), `${RES}/drawable-${density}/ic_notification.png`])
}

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  for (const [file, size, out] of jobs) {
    const svg = fs.readFileSync(path.join(A, file), 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `)
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    await page.locator('svg').screenshot({ path: out, omitBackground: true })
  }
  await browser.close()
  console.log(`${jobs.length} images written`)
})()
