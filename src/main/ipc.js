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
    // `readOnly` tells the renderer this document cannot be saved back in place.
    // It drives the window title and the first-save behaviour.
    return { path: filePath, html, format: module.name, readOnly: isWritable(module) ? false : true }
  } catch (err) {
    // Missing/corrupt file: drop from recent so the submenu self-heals.
    removeRecent(filePath)
    notifyRecentChanged()
    return { error: String(err) }
  }
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
  ipcMain.handle('file:open-path', async (_event, filePath) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { error: 'No file path provided' }
      }
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

      // 5. Success. `upgradedFrom` lets the renderer tell the user the source
      // file was left alone, so "where did my .md go?" has an immediate answer.
      return {
        canceled: false,
        path: targetPath,
        format: module.name,
        upgradedFrom
      }
    } catch (err) {
      return { canceled: false, error: String(err) }
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
