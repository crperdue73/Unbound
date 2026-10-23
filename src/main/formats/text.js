// Plain-text (.txt) format — READ ONLY.
//
// Unbound opens .txt and will not save to it. This is deliberate.
//
// A .txt file has no formatting. If Unbound saved back to .txt, every heading,
// bold run, table and image the user added would be silently destroyed on the
// next Ctrl+S — the file would round-trip to something strictly worse than what
// was on screen. So saving a document that came from a .txt writes a .docx
// instead (see the save path in ipc.js): the source file is left untouched and
// the upgraded document gets a real format that can hold what was added.
//
// Reading, on the other hand, is lossless in the only direction that matters:
// plain text becomes paragraphs, and nothing is lost.

export const name = 'Text File'
export const extensions = ['txt']
export const readOnly = true

// HTML-escape text destined for the editor. Content comes from a user's own
// file, so this is about correctness (a stray '<' must render as '<') at least
// as much as it is about safety.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Plain text -> HTML paragraphs.
//
// The mapping keeps what a plain-text file actually encodes and invents nothing:
//   - a blank line is a paragraph break (the only structure .txt has)
//   - single newlines inside a paragraph become <br>, so line breaks the author
//     typed are preserved rather than reflowed away
//   - leading/trailing whitespace on each line is kept (indented code, poetry,
//     ASCII art), which is why the escaping happens per line and not after join
export async function deserialize(data) {
  const text = toText(data)

  // Normalize CRLF/CR so Windows and classic-Mac files behave the same.
  const normalized = text.replace(/\r\n?/g, '\n')

  // A UTF-8 BOM would otherwise appear as a stray character in the first line.
  const body = normalized.charCodeAt(0) === 0xfeff ? normalized.slice(1) : normalized

  if (!body.trim()) return '<p></p>'

  return body
    // A file ending in a newline is the normal case, not an extra empty line.
    // Without this drop, the final paragraph would carry a dangling <br>.
    .replace(/\n+$/, '')
    .split(/\n{2,}/) // paragraph = one or more blank lines
    .map((para) => {
      const lines = para.split('\n').map(escapeHtml)
      // A paragraph that is nothing but whitespace carries no content.
      if (lines.every((l) => !l.trim())) return null
      return `<p>${lines.join('<br>')}</p>`
    })
    .filter(Boolean)
    .join('\n')
}

// There is no serialize export: Unbound does not write .txt. The save path
// checks `readOnly` and falls back to .docx, so a missing `serialize` is a
// statement about the format rather than an omission.

function toText(data) {
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8')
  }
  throw new Error('Not a valid text file (expected file bytes)')
}
