// Unbound main process entry point.
// - Creates the main BrowserWindow (contextIsolation on, nodeIntegration off).
// - Loads the renderer (electron-vite dev server in dev, built file in prod).
// - Builds the application Menu (File items emit 'menu:action').
// - Registers IPC handlers (file open/save, ui state).

import { app, BrowserWindow, Menu, dialog, session, nativeImage } from 'electron'
import { fileURLToPath } from 'node:url'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { registerIpc } from './ipc.js'
import { getRecent, clearRecent } from './recent.js'
import { restoredBounds, wasMaximized, captureWindowState } from './window-state.js'

import iconUrl from '../../build/icon.png?asset'

const __dirname = path.dirname(fileURLToPath(import.meta.url))


// Window/taskbar icon. electron-builder stamps the .exe icon at package time, but
// a dev run and the Linux build both need one at runtime. Importing the PNG makes
// electron-vite emit it into out/main as an asset, so the path is correct in both
// the dev tree and the packaged app (which ships only out/**).
function appIcon() {
  const img = nativeImage.createFromPath(iconUrl)
  return img.isEmpty() ? undefined : img
}

// Default window geometry, also used as the fallback when no (or offscreen)
// persisted state exists.
const DEFAULT_BOUNDS = { width: 1100, height: 800 }

let mainWindow = null

// A path handed to us before the window exists (a double-clicked .docx in the
// file manager, an `unbound-editor notes.docx` from a shell, a macOS open-file
// event). Held until a window is ready to receive it, then cleared. See
// takePendingOpen() below — it is the single place the handoff happens.
let pendingOpen = null

// Debounce timer for persisting window state on resize/move.
let saveStateTimer = null

// Close-guard state. forceClose lets the renderer (after Save / Don't Save) or
// the main-process dialog allow the window to actually tear down. lastDirty is
// kept in sync from the renderer's ui:set-dirty messages so the close handler
// can decide synchronously.
let forceClose = false
let lastDirty = false

// ---------------------------------------------------------------------------
// Menu: each File action sends 'menu:action' to the focused window's renderer.
// ---------------------------------------------------------------------------

function sendMenu(action) {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow
  if (win && !win.isDestroyed()) {
    win.webContents.send('menu:action', action)
  }
}

// normalizeOpenPath returns the document path named on the command line, or
// null. It has to cope with two different argument shapes:
//   - packaged Linux:   ['/opt/unbound-editor/unbound-editor', 'notes.docx']
//   - dev on Linux:     ['.../electron', '.', 'notes.docx']
//   - electron-builder adds a bare '.' as the app dir in dev, so a '.' or the
//     app path itself is never a document.
// Only arguments naming a real, existing file are accepted — a stray flag or a
// relative path that does not resolve is dropped rather than guessed at, in the
// same spirit as the collector dropping a write record with no target.
function normalizeOpenPath(argv) {
  if (!Array.isArray(argv)) return null
  for (const arg of argv.slice(1)) {
    if (!arg || arg === '.' || arg.startsWith('-')) continue
    let candidate = arg
    // A file manager may pass a file:// URL instead of a bare path.
    if (candidate.startsWith('file://')) {
      try {
        candidate = fileURLToPath(candidate)
      } catch {
        continue
      }
    }
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
    } catch {
      /* unreadable — not a document we can open */
    }
  }
  return null
}

// queueOpen records a path to open once a renderer is listening. Called before
// the window exists (argv, macOS open-file) and while it exists (second-instance).
function queueOpen(filePath) {
  if (!filePath) return
  pendingOpen = filePath
  deliverPendingOpen()
}

// deliverPendingOpen hands the pending path to the window, if there is one that
// has finished loading. It is deliberately idempotent: a path is only cleared
// once it has actually been sent, so an event that arrives before the renderer
// is ready is not silently dropped — which is the failure mode this exists to
// prevent (a double-click that opens a blank window).
function deliverPendingOpen() {
  if (!pendingOpen) return
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.webContents.isLoading()) return
  const filePath = pendingOpen
  pendingOpen = null
  // Reuse the exact channel File → Open Recent uses, so the renderer path that
  // loads a document (with its dirty-guard and read-only handling) is the same
  // one a menu click takes. No second open pipeline to drift.
  sendToRenderer('menu:open-recent', filePath)
}

function sendToRenderer(channel, payload) {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

// Build the "Open Recent" submenu from the persisted recent list.
function buildRecentSubmenu() {
  const recent = getRecent()
  const items = []

  if (recent.length === 0) {
    items.push({ label: 'No Recent Files', enabled: false })
  } else {
    for (const filePath of recent) {
      items.push({
        label: path.basename(filePath),
        toolTip: filePath,
        click: () => sendToRenderer('menu:open-recent', filePath)
      })
    }
  }

  items.push({ type: 'separator' })
  items.push({
    label: 'Clear Recent Files',
    enabled: recent.length > 0,
    click: () => {
      clearRecent()
      rebuildMenu()
    }
  })

  return items
}

function buildMenu() {
  const isMac = process.platform === 'darwin'

  const template = [
    // macOS application menu.
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendMenu('new')
        },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendMenu('open')
        },
        {
          label: 'Open Recent',
          submenu: buildRecentSubmenu()
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendMenu('save')
        },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendMenu('save-as')
        },
        { type: 'separator' },
        {
          // Files get rewritten underneath the window (agents append logs,
          // scripts regenerate reports). Reload is how you catch up without
          // closing and reopening the document.
          label: 'Reload from Disk',
          click: () => sendMenu('reload')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        // Replaced from the stock { role: 'reload' }: reloading the window throws
        // away unsaved edits and restarts the editor for no reason. Ctrl+R is
        // bound to File > Reload from Disk instead, which is what people
        // actually mean when the document changed underneath them.
        {
          label: 'Reload Document from Disk',
          accelerator: 'CmdOrCtrl+R',
          click: () => sendMenu('reload')
        },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front' },
              { type: 'separator' },
              { role: 'window' }
            ]
          : [{ role: 'close' }])
      ]
    }
  ]

  return Menu.buildFromTemplate(template)
}

// Rebuild + reapply the application menu (used when the recent list changes).
function rebuildMenu() {
  Menu.setApplicationMenu(buildMenu())
}

// ---------------------------------------------------------------------------
// Window.
// ---------------------------------------------------------------------------

function createWindow() {
  // electron-vite emits the preload to out/preload/index.js (alongside
  // out/main/index.js, this file's runtime location).
  const preloadPath = path.join(__dirname, '../preload/index.js')

  // Restore the previous size/position, clamped to a visible display (falls
  // back to defaults if missing or offscreen).
  const bounds = restoredBounds(DEFAULT_BOUNDS)

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 640,
    minHeight: 480,
    show: false,
    title: 'Unbound',
    icon: appIcon(),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Keep the editor responsive (timers/rAF not throttled) when the window
      // is in the background.
      backgroundThrottling: false
    }
  })

  // Restore the maximized state from the last session.
  if (wasMaximized()) mainWindow.maximize()

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Deliver a document that was waiting for us (double-clicked, or named on the
  // command line) as soon as the renderer can receive it. did-finish-load, not
  // ready-to-show: the renderer's subscription is established in its own script,
  // and a message sent before that would be lost with no trace.
  mainWindow.webContents.on('did-finish-load', () => deliverPendingOpen())

  // --- Persist window state ----------------------------------------------
  // Save immediately on close, and debounced on resize/move so dragging or
  // resizing doesn't hammer the disk.
  const scheduleSaveState = () => {
    if (saveStateTimer) clearTimeout(saveStateTimer)
    saveStateTimer = setTimeout(() => {
      saveStateTimer = null
      if (mainWindow) captureWindowState(mainWindow)
    }, 400)
  }
  mainWindow.on('resize', scheduleSaveState)
  mainWindow.on('move', scheduleSaveState)
  mainWindow.on('close', () => {
    if (saveStateTimer) {
      clearTimeout(saveStateTimer)
      saveStateTimer = null
    }
    if (mainWindow) captureWindowState(mainWindow)
  })

  // --- OS-level close guard ----------------------------------------------
  // If the document is dirty (and we're not already force-closing), intercept
  // the close and prompt Save / Don't Save / Cancel.
  mainWindow.on('close', (e) => {
    if (forceClose || !lastDirty) return

    e.preventDefault()
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title: 'Unbound',
      message: 'Save changes before closing?'
    })

    if (choice === 0) {
      // Save: ask the renderer to save, then it will call app:confirm-close.
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app:save-then-close')
      }
    } else if (choice === 1) {
      // Don't Save: discard and close.
      forceClose = true
      if (!mainWindow.isDestroyed()) mainWindow.close()
    }
    // Cancel (2): do nothing, window stays open.
  })

  // --- Spellcheck context menu -------------------------------------------
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const template = []

    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions) {
        template.push({
          label: suggestion,
          click: () => mainWindow.webContents.replaceMisspelling(suggestion)
        })
      }
      if (params.dictionarySuggestions.length === 0) {
        template.push({ label: 'No suggestions', enabled: false })
      }
      template.push({ type: 'separator' })
      template.push({
        label: 'Add to dictionary',
        click: () =>
          session.defaultSession.addWordToSpellCheckerDictionary(
            params.misspelledWord
          )
      })
      template.push({ type: 'separator' })
    }

    template.push(
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll' }
    )

    const menu = Menu.buildFromTemplate(template)
    menu.popup({ window: mainWindow })
  })

  // Load the renderer: dev server URL when provided by electron-vite, else the
  // built index.html.
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    if (saveStateTimer) {
      clearTimeout(saveStateTimer)
      saveStateTimer = null
    }
    mainWindow = null
    forceClose = false
    lastDirty = false
  })
}

// ---------------------------------------------------------------------------
// App lifecycle.
// ---------------------------------------------------------------------------

// --- Single instance + external open requests ------------------------------
// Two Unbounds must not run at once: a second double-click has to reach the
// window that already exists, not start a second editor over the same file.
// Taking the lock is what makes second-instance possible, so it runs before
// whenReady. The lock is released by app.quit().
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // Another instance owns the file. It receives our argv via second-instance.
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    queueOpen(normalizeOpenPath(argv))
  })

  // macOS: the OS delivers Finder/`open` requests as an event, not argv.
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    queueOpen(filePath)
  })
}

app.whenReady().then(() => {
  // A document named on the command line, queued before the window existed.
  queueOpen(normalizeOpenPath(process.argv))

  // Spellcheck: best-effort, skip if unavailable on this platform/build.
  try {
    session.defaultSession.setSpellCheckerLanguages(['en-US'])
  } catch {
    /* spellcheck unavailable */
  }

  registerIpc({
    // Rebuild the Open Recent submenu whenever the recent list changes.
    onRecentChanged: () => rebuildMenu(),
    // Track dirty state for the synchronous OS-level close guard.
    onDirtyChanged: (win, dirty) => {
      if (win && win === mainWindow) lastDirty = dirty
    },
    // Renderer finished saving (or chose to discard): allow the close.
    onConfirmClose: (win) => {
      if (win && win === mainWindow && !mainWindow.isDestroyed()) {
        forceClose = true
        mainWindow.close()
      }
    }
  })

  Menu.setApplicationMenu(buildMenu())
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
