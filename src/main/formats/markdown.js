// Markdown (.md) format — READ ONLY.
//
// Unbound opens Markdown and will not save to it, for the same reason it will
// not save to .txt: Markdown has no way to hold a table, an image at a size, a
// font, a colour or an indent. Anything the user adds in Unbound would be
// flattened or dropped on save. Saving an opened .md therefore writes a .docx
// beside it and leaves the .md untouched.
//
// No turndown here on purpose: the read direction is the only direction, so the
// HTML -> Markdown half of the old format module is gone rather than dormant.

import { marked } from 'marked'

export const name = 'Markdown'
export const extensions = ['md', 'markdown']
export const readOnly = true

// Marked defaults, with GFM on: tables, strikethrough, task lists and autolinks
// are what people mean by "markdown" in 2026, and a table silently rendering as
// a paragraph of pipes would look like Unbound is broken.
marked.setOptions({ gfm: true, breaks: false })

export async function deserialize(data) {
  const text = toText(data)

  // Strip a UTF-8 BOM; it would otherwise show up as a literal character in the
  // first heading.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  if (!body.trim()) return '<p></p>'

  const html = await marked.parse(body)

  // `breaks: false` means single newlines inside a paragraph are NOT hard
  // breaks — standard Markdown behaviour. Unbound's own editor treats a
  // soft-wrapped line as soft, so the two agree.
  return html
}

// No serialize export by design — see the header. The save path checks
// `readOnly` and writes .docx instead.

function toText(data) {
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8')
  }
  throw new Error('Not a valid Markdown file (expected file bytes)')
}
