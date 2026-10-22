<img src="build/icon.png" width="96" alt="Unbound">

# Unbound

**A word processor that never breaks into pages.**

Bound to nothing. No page, no margin, no print queue.

There is no page. No margins to hit, no sheet that runs out, no break you have to
fight. You start typing and the document keeps going — one continuous column that
scrolls as far as you need it to. The scrollbar is the only measure of how much
you've written, and it's honest.

## Download

Installers are built by CI on each platform's own runner and attached to the
[latest release](https://github.com/crperdue73/Unbound/releases/latest).

| Platform | File | Notes |
| --- | --- | --- |
| Windows | `Unbound-Setup-1.0.0.exe` | Installer, or the `-portable.exe` to run without installing |
| Debian / Ubuntu | `Unbound-1.0.0-amd64.deb` | `sudo apt install ./Unbound-1.0.0-amd64.deb` |
| Any Linux | `Unbound-1.0.0-x86_64.AppImage` | `chmod +x` and run. Needs `libfuse2` on newer distros |
| macOS (Apple Silicon) | `Unbound-1.0.0-arm64.dmg` | See the first-launch note below |
| macOS (Intel) | `Unbound-1.0.0-x64.dmg` | See the first-launch note below |

**None of these builds are code-signed.** Signing is a paid certificate on both
Windows and macOS, and Unbound doesn't have one yet.

- **Windows:** SmartScreen shows "Windows protected your PC". More info →
  Run anyway.
- **macOS:** Gatekeeper will say the app "is damaged and can't be opened" or is
  from an unidentified developer. That message is wrong — the app is intact, it
  just isn't notarized. To open it anyway, either right-click the app and choose
  **Open** (once, then it's remembered), or clear the quarantine flag:

  ```sh
  xattr -dr com.apple.quarantine /Applications/Unbound.app
  ```

  If macOS reports the app is damaged rather than unidentified, the `xattr` line
  above is the fix — Gatekeeper reports an un-notarized app that way when it was
  downloaded by a browser.

Unbound is a fork of [FreeWrite](https://github.com/Teoretarded/FreeWrite), rebuilt
around a single idea: **a document is a document, not a stack of paper.**

## Why

Word processors inherited their model from typewriters and printing presses. Page
breaks are an artifact of physical paper, and everything downstream — orphaned
headings, widow lines, "keep with next," reflowing a paragraph and watching the
page count change under you — exists to manage that artifact.

If you're writing on a screen, none of it buys you anything. It costs you
attention. Unbound removes the whole category.

There is deliberately **no print option**. Printing a continuous document
reintroduces every problem the page model creates, and any document that gets
printed eventually gets formatted for print. Unbound doesn't do that. There is also
no PDF export, because PDF is a paginated format by definition — shipping it would
have let pages back in through the back door.

The text is not hostile to length. Write the chapter, write the whole book, keep
scrolling.

## Features

A full formatting toolbar, all wired to a live rich-text editor:

- **History** — Undo / Redo
- **Paragraph styles** — Paragraph, Heading 1/2/3
- **Fonts** — Font family and font size dropdowns
- **Inline formatting** — Bold, Italic, Underline, Strikethrough
- **Color** — Text color picker and multi-color highlighter
- **Scripts** — Subscript and Superscript
- **Clear formatting** — strip marks back to plain text
- **Lists** — Bullet and ordered lists
- **Alignment** — Left, Center, Right, Justify
- **Spacing** — Line-spacing dropdown, Indent and Outdent
- **Insert** — Tables, images, links, date
- **File** — New, Open, Save, Save As (`.docx`)

Plus **find & replace**, a **document outline** for jumping around long pieces,
**focus mode** for when the toolbar becomes noise, **zoom**, and a live status bar
with word and character counts.

A whole document, and nothing that says "page 4 of 31."

## One format: Word

Unbound opens and saves `.docx`. That is the whole list.

Word documents are what people actually send each other, and a real document
format is what a word processor is for. The other exports most editors ship —
Markdown, HTML, plain text — are markup and plain-text surfaces, and a plain-text
round-trip throws away the formatting the app exists to produce. One format,
done properly, beats four done halfway.

There is no PDF export. PDF is a paginated format; shipping it would let pages
back in through the back door.

Saves are atomic (temp file + rename), so a failed write never corrupts an
existing document. Autosave and crash recovery keep the last good state.

## Tech stack

- **[Electron](https://www.electronjs.org/)** — cross-platform desktop shell
- **[TipTap](https://tiptap.dev/)** — the rich-text editor (built on ProseMirror)
- **[electron-vite](https://electron-vite.org/)** + **[Vite](https://vite.dev/)** — build tooling
- **[Vitest](https://vitest.dev/)** — unit tests, **[Playwright](https://playwright.dev/)** — end-to-end
- Word conversion: **[@turbodocx/html-to-docx](https://www.npmjs.com/package/@turbodocx/html-to-docx)** (write) & **[mammoth](https://www.npmjs.com/package/mammoth)** (read)

## Build & Run

Requires Node.js 18+ and npm.

```bash
npm install        # install dependencies
npm run dev        # develop with hot reload
npm run build      # build the production bundle
npm test           # unit test suite
npm run dist       # package a distributable installer
```

## License and lineage

Unbound is a fork of **FreeWrite** by
[Teoretarded](https://github.com/Teoretarded/FreeWrite), and keeps the original
**GNU General Public License v3.0** (GPL-3.0-only). See [LICENSE](./LICENSE) for
the full text.

This repository is the fork's own history, not upstream's. It starts from a
single Unbound commit; the FreeWrite code it descends from is credited in this
section and remains available at the upstream link above under the same license.
The fork's changes are in `src/renderer/styles.css`,
`src/renderer/editor.js`, `src/main/ipc.js` and `src/main/formats/`, and in the
removal of the upstream pagination module, print path, PDF export and
Markdown/HTML/TXT converters.

If you distribute a build of Unbound, the GPL requires you to make the source
available.
