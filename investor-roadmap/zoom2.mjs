import { chromium } from 'playwright'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
const d = dirname(fileURLToPath(import.meta.url))
const b = await chromium.launch()
const c = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 3 })
const p = await c.newPage()
await p.goto('file://' + join(d, 'positioning.html').split('\\').join('/'))
await p.evaluate(() => document.fonts.ready)
await p.waitForTimeout(500)
const el = await p.$('#s1 .map-wrap')
await el.screenshot({ path: join(d, 'zoom-map.png') })
await b.close()
console.log('ok')
