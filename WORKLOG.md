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

## 2026-10-22 — v1.0.1: Markdown and plain text are back (read-only)

Robbie used the app and changed his mind: he wants `.md` and `.txt` to open. His
reasoning is sound and worth recording — those formats have no page model either,
so letting them in costs the product nothing. They become a way to upgrade old
plain-text files into a real document with formatting and images, which is
exactly what Unbound is for.

**The problem I had to design around:** `.md` and `.txt` cannot hold formatting.
A naive "add the formats back" would mean: open `notes.md`, add a heading and a
photo, hit Ctrl+S, and watch every one of those additions vanish — the file
round-trips to something strictly worse than what's on screen. That is the same
category of silent destruction as a page break appearing where you didn't ask.

**So the formats are READ-ONLY:**
- `src/main/formats/text.js` — `.txt` → paragraphs. Blank line = paragraph break,
  single newline = `<br>`, indentation preserved, CRLF/lone-CR normalized, BOM
  stripped, HTML-escaped per line. No `serialize`.
- `src/main/formats/markdown.js` — `.md`/`.markdown` → HTML via `marked` with GFM
  on (tables must render as tables). No `serialize`. `turndown` was NOT brought
  back; the write direction doesn't exist anymore.
- Registry split into `formats` (readable) vs `writable`, plus `isWritable()` and
  `defaultExtension`. `saveFilters()` still offers docx only.
- `ipc.js` save path: if the target resolves to a read-only module, the save is
  **redirected to a `.docx` beside the source** and `upgradedFrom` is returned.
  The source file is never written. `v1.2-notes.md` → `v1.2-notes.docx` (only the
  final extension is replaced).
- Renderer: `readOnlySource` flag forces the save dialog on first save so the user
  sees the new name, and a toast says the original file was left unchanged.
  Drag & drop accepts `md`/`markdown`/`txt`.

**Bug caught by the tests, not by me:** my first `.txt` parser appended a `<br>`
to the last paragraph of every file that ended in a newline — i.e. nearly all of
them. Three tests failed. Fixed by dropping trailing newlines before splitting.

**Verified against real files** (not just unit assertions): built `.md` and `.txt`
fixtures in a temp dir, ran deserialize → serialize → deserialize through the
docx path. Every word survived both, the Markdown table survived, and both source
files were byte-identical afterwards. Files on disk: `notes.docx, notes.md,
v1.2-notes.docx, v1.2-notes.txt`.

**CI guard narrowed, not weakened:** the guard that forbade print/PDF symbols is
unchanged, and a new clause fails the build if `markdown.js` or `text.js` ever
grows a `serialize()`.

Gates: vitest 24/24, `npm run build` green, print/PDF guard CLEAN, read-only
serializer guard CLEAN. Version 1.0.1 (package.json + lock both bumped).

## 2026-10-22 — v1.0.2: the file on disk stops going stale

Robbie's actual workflow, stated plainly: *"My main use is viewing markdown files
made by agents."* That single sentence reprioritized the roadmap. The bottleneck
isn't features, it's that the file keeps changing while it's open. An agent
appends a log entry, a script regenerates a report, and the copy in the window
quietly becomes a lie.

**Reload from disk.** The main process polls the open file's `mtime` + `size`
every 2s. Polling, not `fs.watch`: inotify misses writes that go through
rename (which is exactly what our own atomic write does), and one `stat` call
every two seconds costs nothing. `mtime` alone isn't enough either — coarse
resolution on some filesystems means a fast overwrite can land in the same tick,
so size rides along.

The policy lives in the renderer, because that's where the dirty flag and the
user are:

- **clean document → reload silently.** Nothing can be lost, and stale text is
  actively misleading.
- **unsaved edits → never reload.** A dismissible bar offers Reload / Keep
  editing. Auto-reloading here would throw away typing, which is the one thing
  this app must never do.
- **deleted/moved → told once**, edits stay in the window, watcher stops so it
  doesn't nag every two seconds.
- Every open/save re-arms the watcher at the new path, so switching documents
  can't leave a stale path firing events at the wrong file.

**`Ctrl+R` reassignment.** The stock Electron `View → Reload` reloads the whole
window — which discards unsaved edits and restarts the editor for no reason. I
took the accelerator away from it and gave it to **File → Reload from Disk**;
the window reload moved to `Ctrl+Shift+R`. This is the third time the same
category of bug has shown up: a stock Chromium/Electron affordance that does
something destructive and has a shortcut nobody questions. Print was the first.

**Outline filter.** Agent logs have dozens of headings. The panel now has a
filter box (live, case-insensitive), ArrowDown to enter the list, Escape to
clear. It distinguishes "this document has no headings" from "your filter
matched nothing" — an empty list that looks like a bug is worse than no list.

**Tests: 32** (was 24). The watcher tests use real files and real timing in temp
dirs rather than mocked `fs`, because the bug this prevents only exists on a
real filesystem — including a deletion-reported-exactly-once test and a
re-arm-abandons-old-path test.

Gates: vitest 32/32, `npm run build` green, `out/preload/index.js` confirmed to
expose `reloadFile` + `onFileChanged`, print/PDF guard CLEAN, read-only
serializer guard CLEAN. Version 1.0.2.

Still true and still worth saying: **I have never launched this.** No
`libnspr4`/`libnss3` on this host, so Electron won't start. Everything above is
build + extract + grep + test, never watching it work. Robbie is the only person
who has run Unbound, and his verdict on 1.0.1 ("a text editor with extra tools —
a mule") is better evidence than anything I can generate here.

---

## 2026-10-23 — Repackaged for DragonForge Linux: `unbound-editor`

Dad wants Unbound in the **DragonForge Linux** apt repo (CTEC's distro, Debian
trixie, `repo.dragonforgelinux.org`). Ships **by itself for now** — not in `desktop`,
not in `flex`; he may fold it into `desktop` later.

### The blocker
`Package: unbound` was already taken. **Debian's `unbound` is the NLnet Labs DNS
resolver** (`1.26.1-0+deb13u1` here). Our .deb shipping under that name would
conflict with, shadow, or quietly hijack it on every lab box — and the postinst was
calling `update-alternatives --install /usr/bin/unbound`, the resolver's own binary.
Renamed everything a machine reads to **`unbound-editor`**; display name stays
**Unbound**.

### Measured before deciding (real v1.0.2 .deb)
103 MB download, **353 MB installed** (`Installed-Size: 353316`) — bundled Chromium
under `/opt/Unbound/`, bigger than the entire `dragonforge-flex-packages` list. That
number is why this is an opt-in package and not a metapackage dependency.

### Changed
- `package.json`: `name` and `build.linux.executableName` → `unbound-editor`;
  maintainer → `CTEC DragonForge Team <crperdue@gmail.com>`; desktop entry gains
  `MimeType` for docx/markdown/plain text; new `test:pkgname` script.
- `src/main/index.js`: `normalizeOpenPath()` (argv scan, skips dev's bare `.`, handles
  `file://`), `queueOpen`/`deliverPendingOpen` (delivered on **`did-finish-load`**,
  because the renderer subscribes in its own script and an early message vanishes
  silently), `requestSingleInstanceLock()` + `second-instance`, `app.on('open-file')`.
  Reuses the existing `menu:open-recent` channel — no second open pipeline, so the
  dirty-guard and read-only handling come for free.
- `scripts/check-pkgname.mjs` (new): 6 checks, exits 1 naming file+key.
  Negative-tested by reverting the name in a copy — it failed on both name and
  executableName, which is the point.
- `test/pkgname.test.js` (new): 9 tests encoding the same rules without Electron.
- `.github/workflows/build.yml`: `Guard — package name is not \`unbound\`` in the
  Linux job only.

### Verification
`npx vitest run` → **41/41, 3 files** (was 32). `check-pkgname` → PASS 6/6.
Negative test → correctly red. ESM parse clean. Workflow YAML parses.

### NOT done — do not claim
- **No new `.deb` exists.** electron-builder needs `libnspr4`/`libnss3`; same missing
  toolchain story. Source renamed, artifact not rebuilt.
- **Still never launched.** The file-association code is unit-tested against source
  text, not observed working. A double-click is unverified.
- Not pushed.

### Next
Bump version (identity changed → **1.1.0**, not a silent 1.0.2 re-release), rebuild
with `scripts/build-linux.sh`, confirm `dpkg-deb -f` says `unbound-editor`, verify the
desktop entry inside the new deb, then a real double-click on a real DE. Repo path:
`pool/main/u/unbound-editor/`, signed with the DragonForge key — **which I don't
have.** Dad's call: metapackage or plain package.

## 2026-10-24 — packaging copy fix (1.0.2 deb was wrong)

Robbie caught it installing 1.0.2: the `Comment=` in `/usr/share/applications/unbound.desktop`
still said **"Word (.docx) is the only format."** That line was built from
`build.linux.description` in `package.json`, not from any string in `src/` — which is why the
code and README already said "writes .docx, reads .docx/.md/.txt" and the deb still lied.

Fixed in `package.json`:
- `build.linux.description` → "Saves as Word (.docx); opens .docx, Markdown and plain text."
- `build.linux.desktop.entry.Comment` → "A word processor that never breaks into pages. Saves .docx; opens .docx, Markdown and text." (was the short, format-free synopsis — now carries the format truth in the menu/tooltip too)
- `desktop.entry.Keywords` → added `markdown;txt;` (MimeType was already right: docx + text/markdown + text/plain)
- `package.json` parses clean (JSON_OK).

⚠️ **Not rebuilt.** No `.deb` on this box (no libnspr4/libnss3) — same toolchain gap as before.
Next Linux build picks it up; version stays 1.0.2 until then, so a rebuilt deb needs a bump
(1.0.3) to avoid two different 1.0.2s in the wild.

### Follow-up (same day): repo description + README headline

Robbie caught the same lie in the GitHub repo description:
*A word processor that never breaks into pages. ... Word (.docx) only.*

- `package.json` top-level `description` (feeds npm/repo metadata consumers) →
  "…Saves as Word (.docx); opens .docx, Markdown and plain text."
- `README.md` Formats section: "That is the whole list" → "That is the whole list of what it **writes**" (the sentence read as an app-wide format claim).
- `README.md` Features → File line now names the three readable formats.
- README already carried a "Download 1.0.2" table — unchanged; it's about artifacts not formats.

⚠️ **Still needs Robbie (I will not guess a credential):**
1. GitHub repo **description** field — API-only, no `gh` CLI on this box and no token here. Exact replacement ready:
   `A word processor that never breaks into pages. No print option, no PDF, no page breaks — one continuous column that scrolls as far as you need it. Saves .docx; opens .docx, Markdown and text.`
2. Git **push** for the `package.json` / README / `.desktop` copy fixes — this tree has no push credential (same three open gates as Watchman).

### Guard added: `test/copy.test.js` (10 tests) — the claim drift can't happen silently again

The registry (`src/main/formats/index.js`) is now the single source of truth. The test
derives what the copy is *allowed* to claim and fails when prose promises less than the
product does:

- **No "Word only" claims** anywhere in `package.json` description / `build.linux.description` /
  `desktop.entry.Comment` / `README.md` — 5 patterns incl. the literal `Word (.docx) is the
  only format` and `Word (.docx) only`.
- **Menu entry + long description must NAME** the readable formats (Markdown, text) — so a
  vague synopsis can't masquerade as correct.
- **MIME types must cover every readable format** (docx + text/markdown + text/plain).
- **No save target outside `writable`** — scans README save-verbs, strips markdown emphasis
  first. Only real instruction shapes count (`saves .docx`, `saved as .docx`,
  `Save As (.docx)`); a bare "saves" in prose is not evidence of a promise.
- **Guards the guard:** asserts the registry really has >1 readable format, so if that ever
  becomes false the exclusivity rule fails loudly instead of passing vacuously.

**Negative-tested against the actual shipped strings** (not invented ones):
- restored the real 1.0.2 `.desktop`/deb description string → **2 tests fail**
- restored the real GitHub repo-description string → **1 test fails**
- both restored clean (diff-verified), `package.json` parses, **full suite 51/51 green**
  (was 41 — +10 from this file)

Runs on all three CI jobs via `npm test`.

## 2026-10-24 — 1.0.3 shipped to GitHub, verified against the real installer

Robbie supplied a token; repo description, copy fixes and a build all landed.
Release: **v1.0.3**, all three runners green, 7 assets.

**Verified on the actual downloaded .deb** (not just the tree):
- `usr/share/applications/unbound.desktop` → `Comment=` now reads "…Saves as Word
  (.docx); opens .docx, Markdown and plain text."; `Keywords=` carries `markdown;txt;`;
  `MimeType=` carries all three. The 1.0.2 lie is gone from the shipped package.
- `resources/app.asar` (37.8 MB): zero hits for `FreeWrite`, `freewrite`, `printToPDF`,
  `printHtml`, `app:print`, `createPdf`, `doPrint`, `PRINT_CSS`, `@media print`,
  `formats/pdf`. One hit for "no print option" — the toast.
- `Package: unbound-editor`, `Version: 1.0.3`, `Exec=/opt/Unbound/unbound-editor %U`
  matching the real binary name. No clash with Debian's `unbound` DNS resolver.
- 14 unresolved .so at runtime here, all from this host having no GTK/NSS — the box's
  gap, not the package's. Did not launch; no display, and Dad tests it himself.

**I broke CI once and fixed it.** The version bump used
`sed 's/"version": "1.0.2"/"version": "1.0.3"/g' package-lock.json` — unanchored, so it
rewrote 12 transitive dep pins (`balanced-match`, `wrappy`, `util-deprecate`,
`@oozcitak/util` under `@oozcitak/url`, …). `npm ci` refused on all three runners
(EUSAGE) and no installer was produced. Restored the lock from the previous commit,
bumped only `version` and `packages[""].version`, confirmed with `npm ci --dry-run`
(exit 0), pushed, re-pointed the tag. Second build: windows/linux/macos all success.

Lesson: a version bump touches exactly two lines of a lockfile. `npm version` does
this correctly; hand-editing with an unanchored regex does not.
