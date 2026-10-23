// IPC handlers for the main process: file open/save flows and UI state
// messages (dirty / title).
//
// Unbound reads and writes exactly one format: Word (.docx). There is no print
// path and no PDF export — a paginated format contradicts the product.

import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { byExtension, isWritable, defaultExtension } from './formats/index.js'
import { showOpen, showSave } from './dialogs.js'
import { addRecent, removeRecent } from './recent.js'
import { watchFile, unwatchFile } from './filewatch.js'

// ---------------------------------------------------------------------------
// Atomic write: write to a temp file in the same directory, then rename over
// the target so a partial/failed write can never corrupt an existing file.
// ---------------------------------------------------------------------------

async function atomicWrite(targetPath, data) {
  const dir = path.dirname(targetPath)
  const base = path.basename(targetPath)
  const tmp = path.join(
    dir,
    `.${base}.${process.pid}.${Date.now()}.tmp`
  )

  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8')

  try {
    await fs.writeFile(tmp, payload)
    await fs.rename(tmp, targetPath)
  } catch (err) {
    // Best-effort cleanup of the temp file on failure.
    try {
      await fs.unlink(tmp)
    } catch {
      /* ignore */
    }
    throw err
  }
}

function extOf(filePath) {
  return path.extname(filePath).toLowerCase().replace(/^\./, '')
}

// ---------------------------------------------------------------------------
// Window title helper (set from ui:set-title / ui:set-dirty messages).
// ---------------------------------------------------------------------------

function windowFor(event) {
  return BrowserWindow.fromWebContents(event.sender) ?? null
}

// ---------------------------------------------------------------------------
// Registration. Call once after the app is ready.
// ---------------------------------------------------------------------------

// Hooks set by registerIpc so other main modules can react to IPC events.
//   onRecentChanged() -> rebuild the Open Recent submenu.
//   onDirtyChanged(win, dirty) -> let the close guard track dirty state.
let hooks = { onRecentChanged: null, onDirtyChanged: null, onConfirmClose: null }

// The document currently open in the window. `signature` is what the file looked
// like when we last read or wrote it, so a reload can tell the user whether the
// thing they are about to load is actually newer than what they have.
let openDoc = { path: null, signature: null }

// Which window the watcher should notify. Set on every import so the callback
// has somewhere to send file:changed.
let watcherWin = null

function signatureOf(filePath) {
  return fs
    .stat(filePath)
    .then((s) => ({ mtimeMs: s.mtimeMs, size: s.size }))
    .catch(() => null)
}

// Image file extensions the picker accepts, plus their MIME types.
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']
const IMAGE_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp'
}

// Read an image file from disk into a data URL, reusing the shared MIME mapping.
// Returns { dataUrl } on success or { error } on failure. Never throws.
async function readImageToDataUrl(filePath) {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { error: 'No file path provided' }
    }
    const ext = extOf(filePath)
    const mime = IMAGE_MIME[ext] || 'application/octet-stream'
    const data = await fs.readFile(filePath)
    return { dataUrl: `data:${mime};base64,${data.toString('base64')}` }
  } catch (err) {
    return { error: String(err) }
  }
}

function notifyRecentChanged() {
  try {
    hooks.onRecentChanged?.()
  } catch {
    /* never let a menu rebuild crash an IPC handler */
  }
}

// Shared importer: read+deserialize a path. Updates recent on success; drops it
// from recent on failure. Returns { path, html, format } or { error }.
async function importPath(filePath) {
  const module = byExtension(extOf(filePath))
  if (!module || typeof module.deserialize !== 'function') {
    removeRecent(filePath)
    notifyRecentChanged()
    return { error: 'Unsupported file type' }
  }
  try {
    const data = await fs.readFile(filePath)
    const html = await module.deserialize(data)
    addRecent(filePath)
    notifyRecentChanged()

    openDoc = { path: filePath, signature: await signatureOf(filePath) }
    armWatcher(filePath)
    // `readOnly` tells the renderer this document cannot be saved back in place.
    // `signature` is the baseline the renderer compares against when the file
    // changes on disk, so a reload cannot load a different file than expected.
    return {
      path: filePath,
      html,
      format: module.name,
      readOnly: !isWritable(module),
      signature: openDoc.signature
    }
  } catch (err) {
    // Missing/corrupt file: drop from recent so the submenu self-heals.
    removeRecent(filePath)
    notifyRecentChanged()
    return { error: String(err) }
  }
}

// Point the watcher at the current document and route its events to `win`.
// Re-arming on every open is what makes switching documents safe: the previous
// file stops being watched, so a stale path can never fire.
function armWatcher(filePath) {
  const win = watcherWin
  if (!win || win.isDestroyed?.()) return
  watchFile(filePath, (evt) => {
    if (!win || win.isDestroyed?.()) return
    try {
      win.webContents.send('file:changed', evt)
    } catch {
      /* window went away mid-flight */
    }
  })
}

export function registerIpc(opts = {}) {
  hooks = {
    onRecentChanged: typeof opts.onRecentChanged === 'function' ? opts.onRecentChanged : null,
    onDirtyChanged: typeof opts.onDirtyChanged === 'function' ? opts.onDirtyChanged : null,
    onConfirmClose: typeof opts.onConfirmClose === 'function' ? opts.onConfirmClose : null
  }

  // --- Open flow ---------------------------------------------------------
  ipcMain.handle('file:open', async (event) => {
    const win = windowFor(event)
    watcherWin = win ?? watcherWin
    try {
      const res = await showOpen(win)
      if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
        return { canceled: true }
      }

      const filePath = res.filePaths[0]
      const result = await importPath(filePath)
      if (result.error) return { canceled: false, error: result.error }
      return { canceled: false, ...result }
    } catch (err) {
      return { canceled: false, error: String(err) }
    }
  })

  // --- Open a specific path (recent files / programmatic) ----------------
  ipcMain.handle('file:open-path', async (event, filePath) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { error: 'No file path provided' }
      }
      watcherWin = windowFor(event) ?? watcherWin
      return await importPath(filePath)
    } catch (err) {
      return { error: String(err) }
    }
  })

  // --- Pick an image -> data URL -----------------------------------------
  ipcMain.handle('file:pick-image', async (event) => {
    const win = windowFor(event)
    try {
      const opts = {
        title: 'Insert Image',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: IMAGE_EXTS }]
      }
      const res = win
        ? await dialog.showOpenDialog(win, opts)
        : await dialog.showOpenDialog(opts)

      if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
        return { canceled: true }
      }

      const filePath = res.filePaths[0]
      const result = await readImageToDataUrl(filePath)
      if (result.error) return { canceled: false, error: result.error }
      return { canceled: false, dataUrl: result.dataUrl }
    } catch (err) {
      return { canceled: false, error: String(err) }
    }
  })

  // --- Read an image at a known path -> data URL (drag-and-drop) ----------
  ipcMain.handle('file:read-image', async (_event, filePath) => {
    return readImageToDataUrl(filePath)
  })

  // --- Confirm close (renderer agreed to discard / finished saving) ------
  ipcMain.on('app:confirm-close', (event) => {
    const win = windowFor(event)
    if (win && hooks.onConfirmClose) {
      hooks.onConfirmClose(win)
    }
  })

  // --- Save flow ---------------------------------------------------------
  ipcMain.handle('file:save', async (event, payload) => {
    const win = windowFor(event)
    if (win) watcherWin = win
    const { html, currentPath = null, saveAs = false } = payload ?? {}

    try {
      // 1. Determine target path.
      let targetPath = currentPath
      if (saveAs || !currentPath) {
        const res = await showSave(win, currentPath || undefined)
        if (res.canceled || !res.filePath) {
          return { canceled: true }
        }
        targetPath = res.filePath
      }

      // 2. Resolve the format for the target path.
      //
      // A document opened from .md or .txt has no writable format at that path.
      // Saving in place would silently destroy every heading, table, image and
      // font the user added — the exact failure this app refuses to perform. So
      // the save is redirected to a .docx beside the source file. The source is
      // never written and never overwritten.
      let module = byExtension(extOf(targetPath))
      let upgradedFrom = null

      if (module && !isWritable(module)) {
        upgradedFrom = module.extensions[0]
        module = byExtension(defaultExtension)
        // Same folder, same name, new extension: "notes.md" -> "notes.docx".
        // Replacing only the final extension means "v1.2-notes.md" keeps its dot.
        targetPath = targetPath.replace(/\.[^./\\]+$/, '') + `.${defaultExtension}`
      }

      // No usable extension at all: append the default rather than guessing.
      if (!module) {
        module = byExtension(defaultExtension)
        if (!extOf(targetPath)) targetPath = `${targetPath}.${defaultExtension}`
      }

      // 3. Serialize + atomic write.
      //
      // Guard, not a formality: if a module without `serialize` ever reaches
      // here, calling it throws inside the try and the user gets an error
      // instead of a silently emptied file.
      if (!isWritable(module)) {
        return { canceled: false, error: 'This file type cannot be saved' }
      }
      const data = await module.serialize(html)
      await atomicWrite(targetPath, data)

      // 4. Record in recent files and rebuild the submenu.
      addRecent(targetPath)
      notifyRecentChanged()

      // The save just made the file match the window, so re-baseline and move
      // the watcher: a document upgraded from .md to .docx now lives at a new
      // path, and the old one must stop being watched.
      openDoc = { path: targetPath, signature: await signatureOf(targetPath) }
      armWatcher(targetPath)

      // 5. Success. `upgradedFrom` lets the renderer tell the user the source
      // file was left alone, so "where did my .md go?" has an immediate answer.
      return {
        canceled: false,
        path: targetPath,
        format: module.name,
        upgradedFrom,
        signature: openDoc.signature
      }
    } catch (err) {
      return { canceled: false, error: String(err) }
    }
  })

  // --- Reload the open document from disk --------------------------------
  //
  // A file being written by something else (an agent appending a log, a script
  // regenerating a report) goes stale in the window. This re-reads it.
  //
  // The caller passes its own signature — what the file looked like when the
  // renderer last synced. If that differs from ours, the document changed
  // underneath us and the caller is reloading something other than what it
  // thinks; we say so rather than pretending the reload was clean.
  ipcMain.handle('file:reload', async (_event, requested) => {
    try {
      if (!openDoc.path) return { ok: false, error: 'No file is open' }

      const current = await signatureOf(openDoc.path)
      if (!current) {
        return { ok: false, error: 'The file is no longer there', missing: true }
      }

      if (requested && openDoc.signature && requested.mtimeMs !== openDoc.signature.mtimeMs) {
        // Not fatal — the caller may be reloading precisely to catch up. Just
        // report that the baseline moved so the UI can word it honestly.
      }

      const module = byExtension(extOf(openDoc.path))
      if (!module) return { ok: false, error: 'Unsupported file type' }

      const data = await fs.readFile(openDoc.path)
      const html = await module.deserialize(data)

      openDoc.signature = current
      return {
        ok: true,
        path: openDoc.path,
        html,
        format: module.name,
        readOnly: !isWritable(module),
        signature: current
      }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // --- UI state: dirty ---------------------------------------------------
  ipcMain.on('ui:set-dirty', (event, dirty) => {
    const win = windowFor(event)
    if (win) win.setDocumentEdited?.(!!dirty)
    // Let the OS-level close guard track dirty state synchronously.
    try {
      hooks.onDirtyChanged?.(win, !!dirty)
    } catch {
      /* ignore */
    }
  })

  // --- UI state: title ---------------------------------------------------
  ipcMain.on('ui:set-title', (event, title) => {
    const win = windowFor(event)
    if (win && typeof title === 'string') win.setTitle(title)
  })
}

// Re-exported for callers that need app metadata (paths, version).
export { app }
