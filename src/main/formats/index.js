// Formats registry.
//
// Unbound has exactly one document format: Word (.docx). It opens and saves it
// and nothing else.
//
// There is deliberately no PDF here — PDF is a paginated format by definition,
// and the whole point of this app is that documents never break into pages.
//
// There is deliberately no Markdown / HTML / plain-text export either. Those are
// markup and plain-text surfaces, not documents, and a plain-text round-trip
// throws away everything a word processor is for. One format, done properly, is
// the product.

import * as docx from './docx.js'

// All known format modules.
export const formats = [docx]

// Look up a format module by file extension (lowercase, no leading dot).
export function byExtension(ext) {
  if (!ext) return undefined
  const e = String(ext).toLowerCase().replace(/^\./, '')
  return formats.find((f) => f.extensions.includes(e))
}

// Save dialog filters. Word only — it is the only thing Unbound writes.
export function saveFilters() {
  return [{ name: docx.name, extensions: docx.extensions }]
}

// Open dialog filters. Word only — it is the only thing Unbound reads.
export function openFilters() {
  return [{ name: docx.name, extensions: docx.extensions }]
}
