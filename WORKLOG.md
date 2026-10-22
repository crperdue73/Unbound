# Unbound — Working State

Fork of FreeWrite @ `fa13d86`. Product: a word processor that never paginates.
Branch: `unbound/no-pages`.

## Done (P1–P4 core)

**P1 — Pagination removed**
- Deleted `src/renderer/pagination.js` (the TipTap extension that drew US-Letter
  page sheets + page-break spacers).
- `editor.js`: dropped the `Pagination` import and extension registration.
- `index.html`: removed the `.page-sheets` layer; `.page-wrap` is now just the
  document column.
- `styles.css`: `.page-wrap` is no longer an 816px fixed Letter sheet — it is
  `min(--ub-measure, 100%)`, ~760px reading measure, auto height, no page gaps.
  `.ProseMirror` lost `min-height: 1056px` and its 96px page margin (now a plain
  8px top / 240px bottom breathing pad that scrolls).
- Deleted `e2e/pagination.e2e.mjs`; replaced with `e2e/continuous.e2e.mjs`,
  which asserts the invariant: zero `.fw-sheet`, zero `.page-sheets`, zero
  `.fw-page-break`, surface `scrollHeight === clientHeight` on a long document,
  column narrower than 816px, and no print affordance anywhere.

**P2 — Print removed**
- `src/main/ipc.js`: deleted `app:print` handler + `printHtml()`.
- `src/preload/index.js`: deleted `print` from the bridge.
- `src/renderer/main.js`: deleted `doPrint()`, the Ctrl+P branch, the toolbar
  `onPrint` action, and the bridge fallback stub.
- `src/renderer/toolbar.js`: deleted the print button and its icon.
- `styles.css`: deleted the whole `@media print` block and the sheet/print rules.

**P3b — Docx-only (2026-10-22, Robbie's call: "docx only, ditch pdf entirely")**
- Deleted `src/main/formats/txt.js`, `html.js`, `markdown.js`. `formats/` is now
  `docx.js` + `index.js`.
- `formats/index.js` rewritten: `formats = [docx]`; `saveFilters()` and
  `openFilters()` each return the single Word filter (the old "All supported"
  aggregate is gone — it would have been a one-item list).
- Renderer drag & drop: `DOC_EXTS` cut from `['docx','md','markdown','html',
  'htm','txt']` to `['docx']`, so dropping a .txt no longer pretends to open it.
- Dependencies: `npm uninstall turndown marked` (3 packages removed). `mammoth`
  and `@turbodocx/html-to-docx` stay — they are the docx read/write pair.
- `test/formats.test.js` rewritten for one format: 10 tests, including a real
  docx round-trip (zip magic `PK`, heading/strong/em/li all survive) and a
  negative sweep asserting `pdf`, `md`, `html`, `txt` resolve to nothing.
- README + BRIEF updated: "One format: Word".

**P3 — PDF export removed**
- Deleted `src/main/formats/pdf.js`.
- `src/main/formats/index.js`: registry is now `[txt, html, markdown, docx]`;
  `saveFilters()` is docx → md → html → txt (no PDF).
- `src/main/ipc.js`: deleted `createPdf()`, `waitForContentReady()`,
  `wrapForPrint()`, `PRINT_CSS`; the save path calls `module.serialize(html)`.
- `test/formats.test.js`: PDF assertions removed, ordering contract updated,
  added "no format module offers pdf" + `formats.length === 4`.

**P4 — Settings cleanup**
- "Page color" → "Canvas color"; it now tints `.page-wrap` directly instead of
  recoloring paper sheets. `e2e/settings.e2e.mjs` updated to match.

## Gates

- `npx vitest run` → **10/10 pass** ✅ (docx-only suite)
- `npm run build` → **green** ✅
- `grep -rniE "printToPDF|printHtml|app:print|createPdf|wrapForPrint|PRINT_CSS|doPrint" src/ e2e/ test/`
  → **CLEAN** ✅
- **Runtime/e2e verification BLOCKED.** Electron and Playwright Chromium both
  fail to launch on this host:
  `error while loading shared libraries: libnspr4.so: cannot open shared object file`.
  `ldd` reports 14 missing libs; `libnss3` and `libnspr4` are not installed.
  `apt-get -s install libnspr4` resolves fine — it needs sudo. **Dad's call.**
  (Same class of defect as the missing Go toolchain noted 2026-10-08.)

**P5 — Rebrand done**
- `README.md` rewritten from scratch: name, the no-page argument, no print, no
  PDF, format table is docx/md/html/txt only, upstream attribution to FreeWrite
  kept under GPL-3.0-only, and a short note on which files the fork changes.
- `package.json`: `name: unbound`, description, author, `appId:
  com.crperdue.unbound`, `productName: Unbound`, Windows `shortcutName: Unbound`.
- Window title (`src/main/index.js` ×2), `index.html` `<title>`, app-identity
  string in `main.js` (`Unbound — <file>`), and the structural-failure console
  message all say Unbound now.
- **Preload bridge renamed `window.freewrite` → `window.unbound`** (preload
  `exposeInMainWorld`, plus every renderer/e2e reference). Done now deliberately:
  nothing is released, and a fresh install has no saved localStorage to orphan.
- Storage keys renamed `freewrite-*` → `unbound-*` (settings, autosave, theme,
  zoom, focus, outline) and the userData files `freewrite-recent.json` /
  `freewrite-window.json` → `unbound-*.json`.
- Source header comments rebranded across `src/` and `e2e/`.
- Left alone on purpose: `docs/superpowers/specs/2026-06-09-freewrite-design.md`
  is upstream's historical design spec — it documents FreeWrite as it was, not
  Unbound. Attribution, not branding. Leave it.

## Verified after rebrand

- `npx vitest run` → **20/20 pass** ✅
- `npm run build` → **green** ✅
- `grep -rni freewrite src/ package.json e2e/ test/ build/` → **CLEAN** ✅
- Built artifacts cross-check: `out/preload/index.js` exposes `"unbound"`, and
  `out/renderer/assets/index-*.js` references `window.unbound` once — the two
  sides of the bridge agree, so save/open/recovery all resolve. 0 hits for
  `freewrite` in any built file.

## Open / next

- [ ] **Visual check BLOCKED** on libnspr4/libnss3 (see Gates). `node verify.mjs`
      is written and ready — produces `docs/shot-top.png` + `docs/shot-mid.png`,
      and prints sheets/breaks/column-width/print-affordance counts.
- [ ] App icon in `build/` is still upstream's — `build/icon.svg` +
      `make-icon.mjs` generate the .ico/.png. Needs its own mark eventually.
- [ ] Decide: is "one narrow column" right, or should it fill the window width?
      Currently 760px measure — easy to change via `--ub-measure`.
- [ ] Decide: keep the outline panel, focus mode, zoom? (All still working; none
      depend on pages. Zoom now scales a column, which is fine.)


---

## P6 — Brand: Unbound (2026-10-22, Robbie)

Renamed the product from the working title "Endless" to **Unbound**, and gave it
the supplied artwork as its icon.

- **Icon.** Robbie supplied a 1254x1254 PNG master. It is committed as
  `build/icon-source.png`, and `build/make-icon.mjs` was rewritten to rasterize
  from that PNG instead of the old `icon.svg` (deleted — upstream's mark, never
  ours). Outputs `build/icon.ico` (16/24/32/48/64/128/256) and `build/icon.png`
  (512). electron-builder picks up `build/icon.*` automatically via
  `buildResources`, so the installer gets it with no extra config.
- **Runtime icon.** `src/main/index.js` now sets `icon:` on the BrowserWindow, so
  dev runs and Linux builds show the mark too. The PNG is imported with
  `?asset` so electron-vite emits it into `out/main/chunks/` — a plain
  filesystem path would have dangled in the packaged app, which ships only
  `out/**`. Verified the emitted bundle's resolved path exists on disk.
- **Rename sweep.** `Endless` → `Unbound` across `src/`, `e2e/`, `test/`,
  `playwright.config.mjs`, README/BRIEF/WORKLOG. Lowercase: `package.json` name
  `unbound`, `appId` `com.crperdue.unbound`, window titles, `window.endless` →
  `window.unbound` (preload bridge + all call sites), storage keys
  `endless-*` → `unbound-*` (settings/autosave/theme/zoom/focus/outline, plus the
  userData files `unbound-recent.json` / `unbound-window.json`), the TipTap
  `PluginKey('unboundSearch')`, and the e2e tmp prefix `unbound-e2e-`.
- **CSS custom properties** renamed `--fw-*` → `--ub-*`: `--ub-measure`,
  `--ub-text-color`, `--ub-canvas-color`. The `fw` prefix was the last of
  FreeWrite's internals; nothing of it remains in the source.
- **Upstream attribution untouched** — still GPL-3.0-only, still credits
  Teoretarded/FreeWrite. Rebranding is not relicensing.

**Gates after branding:** `npx vitest run` → 10/10 ✅ · `npm run build` → green
✅ · stale-brand sweep over `src/ package.json e2e/ test/ out/` → CLEAN ✅ ·
bridge agrees on both sides (`out/preload` exposes `"unbound"`, renderer calls
`window.unbound`) ✅

---

## P7 — Ship it: public repo, clean history, installer (2026-10-22)

**1. FreeWrite gone from the git history, not just the working tree.** The
upstream root commit carried `src/main/formats/pdf.js` and
`docs/superpowers/specs/2026-06-09-freewrite-design.md`. Deleting them at the tip
would have left both visible in history — a `pdf.js` blob a tester could check
out, and a FreeWrite spec describing the pagination model. Replaced the local
history with a single orphan root commit (`Unbound 1.0.0 …`). Verified: no
parent, 40 files, zero files matching `freewrite|pdf|print`.

Upstream credit now lives in README "License and lineage" and LICENSE, which is
what GPL-3.0 actually requires. The code is credited; the paper model is not
shipped.

**2. Ctrl+P killed at the source.** It was previously unhandled, which meant it
fell through to Chromium's built-in print dialog — a real print path I had
missed. `src/renderer/main.js` now binds it, calls `preventDefault()`, and shows
a toast: "Unbound has no print option — the document has no pages to print."
Added `e2e/continuous.e2e.mjs` test that counts `window.print()` calls after
Ctrl+P and asserts zero, plus a menu scan asserting no Print item and no
`Ctrl+P` accelerator anywhere in the application menu.

**3. CI builds the installer.** `.github/workflows/build.yml` on
`windows-latest`: install → test → **guard greps for print/PDF code and fails
the build if it returns** → build → `electron-builder --win` → upload artifact;
on a `v*` tag, attach to a Release. The guard is the thing that stops this
regressing silently.

**4. electron-builder config bug.** First CI run failed at packaging:
`configuration.win should be one of these: null`. Cause: `shortcutName` was set
under `win`, where electron-builder 26 does not accept it (it belongs under
`nsis`, where it was already correctly set). Removed the duplicate; set
`win.artifactName` to `${productName}-Setup-${version}.${ext}`. Verified locally
with `--dir` before re-running CI.

**Released:** https://github.com/crperdue73/Unbound/releases/tag/v1.0.0
- `Unbound-Setup-1.0.0.exe` (102 MB, NSIS installer)
- `Unbound-1.0.0-portable.exe` (102 MB, no install)
- CI run 39838427217 — all steps green.

**Verified inside the shipped package** (not just the source tree): extracted
`out/main`, `out/preload`, `out/renderer` from the built `app.asar` on the runner
output and grepped — no `printToPDF`/`createPdf`/`printHtml`; no `freewrite` or
`pdf` files; `out/main/chunks/icon-BQvqSyTK.png` present, so the mark ships.

**Still unverified:** the app has never actually been launched. Electron and
Playwright's Chromium both fail here on missing `libnspr4`/`libnss3`, and
`xvfb` is absent, so the installer has been built and inspected but not run.
Robbie is testing it — that is the real gate.
