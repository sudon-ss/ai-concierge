import { chromium } from 'playwright'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
const d = dirname(fileURLToPath(import.meta.url))
const url = 'file://' + join(d, 'slides.html').split('\\').join('/')
const b = await chromium.launch()
const c = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 3 })
const p = await c.newPage()
await p.goto(url)
await p.evaluate(() => document.fonts.ready)
await p.waitForTimeout(500)
for (const id of ['p0', 'p1', 'p2']) {
  const el = await p.$(`#${id} .phone`)
  await el.screenshot({ path: join(d, `zoom-${id}.png`) })
}
await b.close()
console.log('ok')
