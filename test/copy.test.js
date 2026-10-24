// Guards the *claims* Unbound makes about itself.
//
// Why this file exists: on 2026-10-24 the 1.0.2 .deb shipped saying "Word (.docx)
// is the only format" in its .desktop Comment, the GitHub repo description said
// "Word (.docx) only", and the README's Formats section read as an app-wide claim.
// All three were written before Markdown/text support landed. The code was right
// the whole time — the copy had drifted, and nothing was checking it.
//
// So: the format registry is the single source of truth. These tests read the
// registry, derive what the docs/packaging are ALLOWED to claim, and fail when the
// prose promises something narrower than the product.
//
// Cheap file/document tests on purpose — no Electron, no build toolchain.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as registry from '../src/main/formats/index.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(path.join(root, rel), 'utf8')

const pkg = JSON.parse(read('package.json'))
const readme = read('README.md')

// Everything a user can actually read about format support.
const copySources = {
  'package.json description': pkg.description,
  'package.json build.linux.description': pkg.build?.linux?.description,
  'package.json build.linux.desktop.entry.Comment':
    pkg.build?.linux?.desktop?.entry?.Comment,
  'README.md': readme
}

// Phrases that assert Word is the ONLY format. Unbound has read Markdown and
// plain text since before 1.0.0, so any of these is a lie regardless of context.
const EXCLUSIVE_CLAIMS = [
  /\bWord\s*\(\.?docx\)\s+is\s+the\s+only\s+format/i,
  /\bWord\s*\(\.?docx\)\s+only\b/i,
  /\.docx\s+only\b/i,
  /\bonly\s+format\s+is\s+(Word|\.docx)/i,
  /\bonly\s+(accepts?|supports?|opens?|reads?)\s+(Word|\.docx)\b/i
]

describe('format copy matches the registry', () => {
  it('registry really does read more than one format (guards the guard)', () => {
    // If this ever drops to 1, the rest of this file would pass vacuously and
    // the exclusivity rule below would start being wrong. Fail loudly instead.
    expect(registry.formats.length).toBeGreaterThan(1)
    expect(registry.formats.map((f) => f.name)).toEqual(
      expect.arrayContaining(['Word Document'])
    )
    const readable = registry.formats.flatMap((f) => f.extensions)
    expect(readable).toEqual(expect.arrayContaining(['docx', 'md', 'txt']))
  })

  it('writes exactly one format', () => {
    expect(registry.writable).toHaveLength(1)
    expect(registry.writable[0].extensions).toEqual(['docx'])
  })

  for (const [where, text] of Object.entries(copySources)) {
    it(`${where} makes no "Word only" claim`, () => {
      expect(text, `${where} is missing entirely`).toBeTruthy()
      for (const pattern of EXCLUSIVE_CLAIMS) {
        const m = text.match(pattern)
        expect(
          m,
          `${where} claims Word is the only format ("${m?.[0]}"), but the ` +
            `registry reads ${registry.formats
              .flatMap((f) => f.extensions)
              .join('/')}.`
        ).toBeNull()
      }
    })
  }

  it('the installed menu entry names the readable formats, not just Word', () => {
    // This is the exact string Robbie found in the 1.0.2 .deb:
    //   /usr/share/applications/unbound.desktop -> Comment=
    const comment = pkg.build.linux.desktop.entry.Comment
    expect(comment).toMatch(/saves?|writes?/i)
    expect(comment).toMatch(/Markdown|\.md/i)
    expect(comment).toMatch(/text|\.txt/i)
  })

  it('the long package description names the readable formats', () => {
    expect(pkg.build.linux.description).toMatch(/Markdown/i)
    expect(pkg.build.linux.description).toMatch(/text|\.txt/i)
  })

  it('advertises every readable format as a MIME type', () => {
    const declared = pkg.build.linux.desktop.entry.MimeType
      .split(';')
      .filter(Boolean)
    // docx is the written format; the other two are read-only but still openable,
    // so the desktop must offer the app (or "Open with") for them too.
    expect(declared).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    expect(declared).toContain('text/markdown')
    expect(declared).toContain('text/plain')
    // No dead promises: nothing may be advertised that the registry can't open.
    const ext = registry.formats.flatMap((f) => f.extensions)
    expect(ext).toEqual(expect.arrayContaining(['docx', 'md', 'txt']))
  })

  it('README does not offer a save target beyond what the registry writes', () => {
    // The asymmetry is the design: .md/.txt are read-only, and a save to one
    // would silently destroy formatting. So scan the prose for save-verbs and
    // assert the format named in the same breath is a writable one.
    //
    // Deliberately NOT a blanket "no .md near the word save" rule — that fires
    // on the correct sentence ("Open a .md ... hit save: you get notes.docx").
    // Only the direct object of the verb counts: saves/save as/save to X.
    // Strip markdown emphasis so `**saves** `.docx`` reads as `saves .docx`
    // and the extension looks like a plain word. Simpler and more honest than
    // teaching the regex every punctuation dialect a writer might reach for.
    const plain = readme.replace(/[*_`]/g, '')

    const writableExts = registry.writable.flatMap((f) => f.extensions)

    // Only these shapes are save INSTRUCTIONS. A bare "saves" is prose ("the
    // document saves slowly"), so it is not evidence of a promised target.
    const SAVE_TARGET = [
      // "saves .docx" / "saved as .docx" / "save to .docx"
      /\bsav(?:e|es|ed|ing)\s+(?:(?:as|to)\s+)?\.([a-z0-9]{2,5})\b/gi,
      // "Save As (.docx)"
      /\bsave\s+as\s*\(\s*\.([a-z0-9]{2,5})\s*\)/gi
    ]

    const saveTargets = SAVE_TARGET.flatMap((re) =>
      [...plain.matchAll(re)].map((m) => m[1].toLowerCase())
    )

    expect(
      saveTargets.length,
      'README names no save target at all — did the Formats section move?'
    ).toBeGreaterThan(0)

    const offenders = saveTargets.filter((ext) => !writableExts.includes(ext))
    expect(
      offenders,
      `README tells people to save as ${offenders.join(', ')}, but the registry ` +
        `writes only ${writableExts.join(', ')}. A save to a read-only format ` +
        `destroys formatting.`
    ).toEqual([])
  })
})
