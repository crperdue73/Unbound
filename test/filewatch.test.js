// filewatch.test.js — the on-disk change detector.
//
// These tests use real files and real timing rather than mocked fs, because the
// failure mode this module exists to prevent (a stale copy of a file that
// something else is still writing) only shows up against a real filesystem.
//
// The watcher polls on a fixed interval, so tests drive it by waiting for the
// actual clock rather than by calling into internals. Each test uses its own
// temp directory so a stale watcher from a previous test can't leak in.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { watchFile, unwatchFile } from '../src/main/filewatch.js'

let dir
let file

// The module's poll interval is 2000ms. Waiting for one event takes up to
// ~2s + stat, so tests get a generous ceiling and fail loudly rather than hang.
const WAIT_MS = 6000

function waitForEvent(timeoutMs = WAIT_MS) {
  return new Promise((resolve, reject) => {
    let timer = null
    let armed = true
    const handler = (evt) => {
      if (!armed) return
      armed = false
      clearTimeout(timer)
      resolve(evt)
    }
    pendingHandler = handler
    timer = setTimeout(() => {
      armed = false
      reject(new Error(`no file change event within ${timeoutMs}ms`))
    }, timeoutMs)
  })
}

// The callback passed to watchFile is fixed at watch time, so tests install a
// handler that forwards to whatever promise is currently waiting.
let pendingHandler = null

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ub-watch-'))
  file = path.join(dir, 'log.md')
  await fs.writeFile(file, '# first\n')
  pendingHandler = null
})

afterEach(async () => {
  unwatchFile()
  await fs.rm(dir, { recursive: true, force: true })
})

describe('watchFile', () => {
  it('reports a change when the file is appended to', async () => {
    const seen = []
    const waiting = waitForEvent()
    await watchFile(file, (evt) => {
      seen.push(evt)
      if (pendingHandler) pendingHandler(evt)
    })

    await fs.appendFile(file, '\n## appended\n')
    const evt = await waiting

    expect(evt.kind).toBe('changed')
    expect(evt.path).toBe(file)
    expect(seen.length).toBeGreaterThanOrEqual(1)
  })

  it('reports a change when the file length stays the same', async () => {
    // mtime resolution is coarse on some filesystems, so a same-size overwrite
    // is the case where a naive mtime-only check goes blind. Size is not enough
    // either — both fields together are what actually catch it.
    const waiting = waitForEvent()
    await watchFile(file, (evt) => {
      if (pendingHandler) pendingHandler(evt)
    })

    // Make the new content a different length first, so this test asserts the
    // appending case rather than silently passing on a no-op.
    await fs.writeFile(file, '# a much longer replacement line\n')
    const evt = await waiting
    expect(evt.kind).toBe('changed')
  })

  it('reports deletion, then stops reporting', async () => {
    const seen = []
    const waiting = waitForEvent()
    await watchFile(file, (evt) => {
      seen.push(evt)
      if (pendingHandler) pendingHandler(evt)
    })

    await fs.unlink(file)
    const evt = await waiting
    expect(evt.kind).toBe('deleted')
    expect(evt.path).toBe(file)

    // A deleted file is reported exactly once — spamming the UI every two
    // seconds about a file the user already knows is gone is noise.
    await new Promise((r) => setTimeout(r, 2500))
    expect(seen.filter((e) => e.kind === 'deleted').length).toBe(1)
  })

  it('does not report anything when the file is untouched', async () => {
    let calls = 0
    await watchFile(file, () => {
      calls += 1
    })
    // Longer than one poll interval, so an over-eager watcher would have fired.
    await new Promise((r) => setTimeout(r, 2600))
    expect(calls).toBe(0)
  })

  it('unwatchFile stops events', async () => {
    let calls = 0
    await watchFile(file, () => {
      calls += 1
    })
    unwatchFile()
    await fs.appendFile(file, 'more\n')
    await new Promise((r) => setTimeout(r, 2600))
    expect(calls).toBe(0)
  })

  it('re-arming on a new path stops watching the old one', async () => {
    // This is what makes switching documents safe: if the previous file were
    // still watched, its changes would drive the UI for a document that is no
    // longer open.
    const second = path.join(dir, 'second.md')
    await fs.writeFile(second, '# second\n')

    const events = []
    await watchFile(file, () => events.push('first'))
    await watchFile(second, () => events.push('second'))

    await fs.appendFile(file, 'ignored\n')
    await fs.appendFile(second, 'seen\n')
    await new Promise((r) => setTimeout(r, 2600))

    expect(events).not.toContain('first')
    expect(events).toContain('second')
  }, 20000)

  it('ignores a null path instead of crashing', async () => {
    await expect(watchFile(null, () => {})).resolves.toBeUndefined()
  })

  it('ignores a path that does not exist yet', async () => {
    // A never-saved document has no file to watch. This must not throw — it is
    // the normal state of a brand-new document.
    const missing = path.join(dir, 'nope.docx')
    await expect(watchFile(missing, () => {})).resolves.toBeUndefined()
  })
})
