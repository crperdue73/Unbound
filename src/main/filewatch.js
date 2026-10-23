// filewatch.js — notice when the open document changes on disk.
//
// Why this exists: Unbound is often used on files something else is still
// writing. An agent appends to a log, a script regenerates a report, an editor
// on the other monitor saves. Without this, the copy in the window silently goes
// stale and the user is editing a document that no longer matches its file.
//
// Design notes:
//
// 1. POLL BY STAT, NOT fs.watch. `fs.watch` on Linux is inotify-backed and
//    misses things across editors that write via rename (write temp + rename is
//    exactly what Unbound's own atomicWrite does). Polling mtime+size is boring
//    and reliable, and at one stat call every couple of seconds it is free.
//
// 2. mtime ALONE IS NOT ENOUGH. mtime has coarse resolution on some filesystems,
//    so a fast overwrite can land in the same tick as the previous write. Size
//    is included so a same-millisecond change of different length still trips.
//
// 3. THE WATCHER NEVER TOUCHES THE DOCUMENT. It reports. What to do about a
//    changed file — reload silently, ask, ignore — is a policy decision that
//    belongs to the renderer, where the dirty state and the user are.

import fs from 'node:fs/promises'

// 2000ms: fast enough that a person never reads stale text for long, slow
// enough that a 40k-line file being appended to doesn't cause churn.
const POLL_MS = 2000

let timer = null
let watched = null // { path, mtimeMs, size }
let onChange = null

async function stat(filePath) {
  try {
    const s = await fs.stat(filePath)
    return { mtimeMs: s.mtimeMs, size: s.size }
  } catch {
    // Missing file is a real state, not an error to swallow: the user may have
    // deleted or renamed it underneath us, and the UI should say so once.
    return null
  }
}

function stop() {
  if (timer) clearInterval(timer)
  timer = null
  watched = null
  onChange = null
}

function start() {
  if (timer) return
  timer = setInterval(async () => {
    if (!watched || !onChange) return
    const next = await stat(watched.path)
    if (!next) {
      // File vanished. Report once, then stop watching so we don't spam.
      const cb = onChange
      const p = watched.path
      stop()
      cb({ path: p, kind: 'deleted' })
      return
    }
    const changed = next.mtimeMs !== watched.mtimeMs || next.size !== watched.size
    if (!changed) return

    // Update the baseline BEFORE calling back so a slow callback cannot cause
    // the same change to be reported twice.
    watched.mtimeMs = next.mtimeMs
    watched.size = next.size
    onChange({ path: watched.path, kind: 'changed', size: next.size })
  }, POLL_MS)

  // Do not hold the event loop open for this — it is a convenience, not a
  // reason for the process to stay alive.
  if (typeof timer.unref === 'function') timer.unref()
}

/**
 * Watch `filePath` for on-disk changes.
 *
 * @param {string|null} filePath - pass null/undefined to stop watching.
 * @param {(evt: {path: string, kind: 'changed'|'deleted', size?: number}) => void} cb
 */
export async function watchFile(filePath, cb) {
  stop()
  if (!filePath || typeof filePath !== 'string') return

  const initial = await stat(filePath)
  if (!initial) return // nothing to watch yet — a never-saved document

  watched = { path: filePath, ...initial }
  onChange = cb
  start()
}

/** Stop watching. Safe to call repeatedly. */
export function unwatchFile() {
  stop()
}
