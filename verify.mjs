// verify.mjs — headless visual + DOM check of the built renderer in Chromium.
// Electron itself cannot launch on this host (missing libnspr4/libnss3), so we
// load the built out/renderer/index.html directly in Chromium and stub the
// preload bridge. That exercises the real renderer bundle, styles and editor.
import { chromium } from 'playwright'
import path from 'node:path'

const root = process.cwd()
const url = 'file://' + path.join(root, 'out/renderer/index.html')

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

// Stub the preload bridge (window.endless) before the app boots.
await page.addInitScript(() => {
  const noop = () => {}
  window.endless = {
    openFile: async () => ({ canceled: true }),
    saveFile: async () => ({ canceled: true }),
    onMenu: noop, setDirty: noop, setTitle: noop,
    onSaveThenClose: noop, confirmClose: noop, onOpenRecent: noop,
    openPath: async () => ({ canceled: true }),
    pickImage: async () => ({ canceled: true }),
    getPathForFile: () => '',
    readImage: async () => ({ canceled: true })
  }
})

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

await page.goto(url)
await page.waitForSelector('.ProseMirror', { timeout: 15000 })

const html = Array.from({ length: 60 }, (_, i) =>
  `<p>Paragraph ${i + 1}. This line exists only to make the document long enough that a paginated editor would have broken it across several letter-sized sheets by now, which Endless must never do.</p>`
).join('')
await page.evaluate((h) => window.__fwEditor?.commands.setContent(h), html)
await page.waitForTimeout(700)

const m = await page.evaluate(() => {
  const el = document.querySelector('.page-wrap .ProseMirror')
  const wrap = document.querySelector('.page-wrap')
  const area = document.getElementById('editor-area')
  return {
    sheets: document.querySelectorAll('.fw-sheet, .page-sheets').length,
    breaks: document.querySelectorAll('.fw-page-break').length,
    surfaceScrollH: el.scrollHeight,
    surfaceClientH: el.clientHeight,
    surfaceMinH: getComputedStyle(el).minHeight,
    columnWidth: Math.round(wrap.getBoundingClientRect().width),
    areaScrollH: area.scrollHeight,
    areaClientH: area.clientHeight,
    printBtn: document.querySelectorAll('[data-name="print"]').length,
    printBridge: typeof window.endless?.print,
    toolbarButtons: Array.from(document.querySelectorAll('#toolbar .tb-btn')).map(b => b.dataset.name).join(',')
  }
})
console.log(JSON.stringify(m, null, 2))
console.log('page errors:', errors.length ? errors : 'none')

await page.screenshot({ path: root + '/docs/shot-top.png' })
await page.evaluate(() => document.getElementById('editor-area').scrollTo(0, 2400))
await page.waitForTimeout(300)
await page.screenshot({ path: root + '/docs/shot-mid.png' })
await browser.close()
