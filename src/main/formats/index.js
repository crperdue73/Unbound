// Formats registry.
//
// Unbound has ONE format it writes: Word (.docx). It opens that plus two
// read-only formats: Markdown (.md) and plain text (.txt).
//
// Why the asymmetry: .md and .txt have no page model, so reading them costs the
// product nothing — that is why they are allowed in. But they also have no way
// to hold formatting. If Unbound wrote back to them, a heading, a table or an
// image added in the editor would be destroyed on the next save. So a document
// opened from .md/.txt saves as .docx; the source file stays exactly as it was
// and is never overwritten with a downgraded copy.
//
// There is deliberately no PDF. PDF is a paginated format by definition, and the
// product is that documents never break into pages.
//
// There is deliberately no HTML. It is a markup surface like Markdown, but it
// round-trips arbitrary script and styling into the editor for no benefit to a
// person who wants to write.

import * as docx from './docx.js'
import * as markdown from './markdown.js'
import * as text from './text.js'

// Everything Unbound can read. Order matters for the dialog: the format it
// writes comes first.
export const formats = [docx, markdown, text]

// Formats whose `serialize` may be used. Everything else is read-only.
export const writable = formats.filter((f) => typeof f.serialize === 'function')

// The one format new documents default to.
export const defaultExtension = 'docx'

// Look up a format module by file extension (lowercase, no leading dot).
export function byExtension(ext) {
  if (!ext) return undefined
  const e = String(ext).toLowerCase().replace(/^\./, '')
  return formats.find((f) => f.extensions.includes(e))
}

// True when the module can be written. Read-only modules have no `serialize`.
export function isWritable(module) {
  return Boolean(module && typeof module.serialize === 'function' && !module.readOnly)
}

// Save dialog filters. Word only — it is the only thing Unbound writes. Offering
// .md or .txt here would promise a save that silently loses formatting.
export function saveFilters() {
  return [{ name: docx.name, extensions: docx.extensions }]
}

// Open dialog filters. Word first, then each read-only format on its own line so
// the file-type dropdown reads honestly, plus one combined entry for people who
// just want to see every file Unbound can open.
export function openFilters() {
  const all = formats.flatMap((f) => f.extensions)
  return [
    { name: docx.name, extensions: docx.extensions },
    { name: 'Markdown', extensions: markdown.extensions },
    { name: 'Text File', extensions: text.extensions },
    { name: 'All supported documents', extensions: all }
  ]
}
