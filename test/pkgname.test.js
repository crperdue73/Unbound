// Guards the thing Debian would otherwise decide for us: the package name.
// `unbound` is the NLnet Labs DNS resolver and is in every Debian archive. A .deb
// named `unbound` would fight it on a DragonForge lab box, and an executable at
// /usr/bin/unbound would shadow the resolver binary.
//
// These are cheap file/document tests on purpose — they run anywhere, no Electron.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const main = readFileSync(path.join(root, 'src/main/index.js'), 'utf8')

describe('package identity', () => {
  it('is named unbound-editor, not unbound (the Debian DNS resolver)', () => {
    expect(pkg.name).toBe('unbound-editor')
  })

  it('installs a binary named unbound-editor, not /usr/bin/unbound', () => {
    expect(pkg.build.linux.executableName).toBe('unbound-editor')
  })

  it('keeps the human-facing name as Unbound', () => {
    expect(pkg.build.linux.desktop.entry.Name).toBe('Unbound')
  })

  it('claims .docx, .md and .txt so a double-click can reach it', () => {
    const mime = pkg.build.linux.desktop.entry.MimeType.split(';')
    expect(mime).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(mime).toContain('text/markdown')
    expect(mime).toContain('text/plain')
  })
})

describe('opening a document from outside the app', () => {
  // A MimeType association the app cannot honour is worse than none: the file
  // manager offers Unbound, and the user gets an empty window.
  it('takes the single-instance lock so a second double-click reaches the open window', () => {
    expect(main).toContain('requestSingleInstanceLock')
    expect(main).toContain("app.on('second-instance'")
  })

  it('handles macOS open-file events', () => {
    expect(main).toContain("app.on('open-file'")
  })

  it('reads a document path from argv at startup', () => {
    expect(main).toContain('normalizeOpenPath(process.argv)')
  })

  it('reuses the Open Recent channel rather than a second open pipeline', () => {
    expect(main).toContain("sendToRenderer('menu:open-recent', filePath)")
  })

  it('waits for the renderer before delivering, so a slow start cannot drop it', () => {
    expect(main).toContain("webContents.on('did-finish-load'")
  })
})
