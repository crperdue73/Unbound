// continuous.e2e.mjs — the core invariant of Unbound.
//
// A long document must render as ONE continuous scrolling column. There are no
// page sheets, no page-break spacers, no per-page word counts, and no gaps in
// the text. If any of these reappear, this test fails — that is the point.

import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'

/** Build HTML long enough that a paginated editor would have made many pages. */
function longDoc() {
  const paras = []
  for (let i = 1; i <= 80; i++) {
    paras.push(
      `<p>Paragraph ${i}. ` +
        `This line exists only to make the document long enough that a paginated ` +
        `editor would have broken it into several letter-sized sheets by now, ` +
        `which is exactly what Unbound must never do.</p>`
    )
  }
  return paras.join('')
}

test('a long document is one continuous column with no page artifacts', async () => {
  const app = await electron.launch({ args: ['.'] })
  const page = await app.firstWindow()
  await page.waitForSelector('.ProseMirror')

  await page.evaluate((html) => {
    const ed = window.__fwEditor
    ed.commands.setContent(html)
  }, longDoc())

  await page.waitForFunction(() => {
    const el = document.querySelector('.page-wrap .ProseMirror')
    return el && el.scrollHeight > 5000
  })

  // 1. No page sheets anywhere in the DOM.
  expect(await page.locator('.fw-sheet').count()).toBe(0)
  expect(await page.locator('.page-sheets').count()).toBe(0)

  // 2. No page-break spacer decorations.
  expect(await page.locator('.fw-page-break').count()).toBe(0)

  // 3. The editor surface is not constrained to a page height. A sheet-based
  //    layout pins the surface to a multiple of 1056px (US Letter @ 96dpi).
  const metrics = await page.evaluate(() => {
    const el = document.querySelector('.page-wrap .ProseMirror')
    const cs = getComputedStyle(el)
    return {
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      minHeight: cs.minHeight,
      width: el.getBoundingClientRect().width
    }
  })
  expect(metrics.scrollHeight).toBeGreaterThan(5000)
  expect(metrics.scrollHeight).toBe(metrics.clientHeight)
  expect(metrics.minHeight === 'auto' || metrics.minHeight === '0px').toBe(true)

  // 4. The column has a reading measure, not a fixed Letter width (816px).
  expect(metrics.width).toBeLessThan(816)

  await app.close()
})

test('there is no print affordance in the UI', async () => {
  const app = await electron.launch({ args: ['.'] })
  const page = await app.firstWindow()
  await page.waitForSelector('.ProseMirror')

  // No print button in the toolbar.
  expect(await page.locator('#toolbar .tb-btn[data-name="print"]').count()).toBe(0)

  // No print bridge on the preload surface.
  expect(await page.evaluate(() => typeof window.unbound?.print)).toBe('undefined')

  // No File > Print menu item, and no Ctrl+P / Cmd+P accelerator anywhere in
  // the application menu.
  const menuHasPrint = await app.evaluate(({ Menu }) => {
    const items = Menu.getApplicationMenu()?.items ?? []
    const hits = []
    const walk = (list) => {
      for (const it of list) {
        const label = (it.label || '').toLowerCase()
        const accel = (it.accelerator || '').toLowerCase()
        if (label.includes('print') || accel === 'cmdorctrl+p' || accel === 'ctrl+p') {
          hits.push(`${it.label || ''} [${it.accelerator || ''}]`)
        }
        if (it.submenu) walk(it.submenu.items)
      }
    }
    walk(items)
    return hits
  })
  expect(menuHasPrint).toEqual([])

  await app.close()
})

test('Ctrl+P does not open a print dialog', async () => {
  const app = await electron.launch({ args: ['.'] })
  const page = await app.firstWindow()
  await page.waitForSelector('.ProseMirror')

  // Record any attempt to print, and any dialog the app opens.
  await page.evaluate(() => {
    window.__printCalls = 0
    window.print = () => { window.__printCalls++ }
  })

  await page.locator('.ProseMirror').click()
  await page.keyboard.press('Control+p')

  // The keystroke must be swallowed: no window.print() call, and the user gets
  // told why rather than the key silently doing nothing.
  expect(await page.evaluate(() => window.__printCalls)).toBe(0)
  await expect(page.locator('.toast')).toContainText(/no print/i)

  await app.close()
})
