# Unbound — Project Brief

**Forked from:** Teoretarded/FreeWrite @ `fa13d86` (GPL-3.0-only)
**Started:** 2026-10-22
**Owner:** Robbie Perdue · **Dev:** Vivi 🌺

## The idea (Robbie's words)

> A word processor that NEVER breaks into pages. It doesn't need a PRINT option
> at all. It's intended to just scroll forever. NO PAGE BREAKS.

## What that means in engineering terms

- One continuous scrolling document column. No page sheets, no page gaps, no
  page-break spacers, no word-count-per-page, no "print layout" anywhere.
- No print path at all: no menu item, no shortcut, no IPC, no hidden window.
- No PDF export. PDF is a paginated format by definition — shipping it would
  reintroduce pages through the back door.
- **One format: `.docx`, open and save.** No Markdown, no HTML, no plain text,
  no PDF. One format done properly. Printing/document layout is not the product;
  the scroll is.

## Constraints

- **GPL-3.0-only** (inherited). Fork stays GPL-3.0, source stays public, notices kept.
- Keep upstream attribution in README.
- Do not break the rest of the app: formatting toolbar, find & replace, outline,
  focus mode, settings, autosave/recovery, drag & drop, tables, images, links.

## Work plan

- [x] **P1 — Kill pagination.** Remove `Pagination` extension + `pagination.js`,
      drop `.page-sheets` from the DOM, restyle `.page-wrap` from a Letter sheet
      into a continuous column. Replace the pagination e2e test with a
      "no pagination" test.
- [x] **P2 — Kill print.** Toolbar button + icon, Ctrl+P branch, `doPrint`,
      preload `print`, `app:print` IPC handler, `printHtml()`.
- [x] **P3 — Kill PDF export.** `formats/pdf.js`, registry entry, `createPdf()`,
      `waitForContentReady()`, `wrapForPrint()`/`PRINT_CSS`, save-filter tests.
- [x] **P3b — Docx-only.** Deleted the txt/html/markdown format modules, trimmed
      the registry + both dialog filters to Word alone, dropped the `turndown`
      and `marked` dependencies, and cut drag & drop's accepted extensions to
      `.docx`.
- [x] **P4 — Settings + theme cleanup.** Page color becomes canvas color; remove
      print CSS block from styles.css.
- [x] **P5 — README + license notices** — rebrand, describe the no-page model.
- [ ] **P6 — Verify:** `npm test` ✅, `npm run build` ✅, Playwright e2e **blocked on host libs** (see WORKLOG.md → Gates).

## Verification gates (must pass)

- [x] `npm test` green — 20/20
- [x] `npm run build` green
- [ ] e2e: editor mounts, long doc scrolls as ONE continuous column, zero
      `.fw-sheet` elements, zero page-break decorations — **written**
      (`e2e/continuous.e2e.mjs`) but **cannot execute on this host**: Electron and
      Playwright Chromium both fail with `libnspr4.so: cannot open shared object
      file` (libnspr4/libnss3 not installed; 14 missing libs per `ldd`).
- [x] `grep -rniE "printToPDF|printHtml|app:print|createPdf|wrapForPrint|PRINT_CSS|doPrint" src/ e2e/ test/` returns nothing
