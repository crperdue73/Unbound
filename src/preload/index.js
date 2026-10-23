import { contextBridge, ipcRenderer, webUtils } from 'electron'

// Unbound preload bridge.
// Exposes a minimal, typed surface on window.unbound. contextIsolation is on
// and nodeIntegration is off, so the renderer can only reach the main process
// through these explicitly whitelisted calls.

const api = {
  // -> { canceled, path?, html?, format?, error? }
  openFile: () => ipcRenderer.invoke('file:open'),

  // html: editor HTML, opts: { currentPath?, saveAs? }
  // -> { canceled, path?, format?, error? }
  saveFile: (html, opts = {}) =>
    ipcRenderer.invoke('file:save', {
      html,
      currentPath: opts.currentPath ?? null,
      saveAs: !!opts.saveAs
    }),

  // Subscribe to application-menu actions: 'new' | 'open' | 'save' | 'save-as'.
  // Returns an unsubscribe function. Removes any prior listener first so repeated
  // calls (e.g. after a reload) never stack duplicate handlers.
  onMenu: (handler) => {
    if (typeof handler !== 'function') return () => {}
    ipcRenderer.removeAllListeners('menu:action')
    const listener = (_event, action) => handler(action)
    ipcRenderer.on('menu:action', listener)
    return () => ipcRenderer.removeListener('menu:action', listener)
  },

  // Tell main the document dirty state (for window close guards / title).
  setDirty: (dirty) => ipcRenderer.send('ui:set-dirty', !!dirty),

  // Tell main the desired window title.
  setTitle: (title) => ipcRenderer.send('ui:set-title', String(title)),

  // --- Close guard -------------------------------------------------------
  // Main asks the renderer to save before closing (after the user chose "Save"
  // in the close dialog). Returns an unsubscribe function.
  onSaveThenClose: (handler) => {
    if (typeof handler !== 'function') return () => {}
    ipcRenderer.removeAllListeners('app:save-then-close')
    const listener = () => handler()
    ipcRenderer.on('app:save-then-close', listener)
    return () => ipcRenderer.removeListener('app:save-then-close', listener)
  },

  // Renderer tells main it's OK to close now (saved or chose to discard).
  confirmClose: () => ipcRenderer.send('app:confirm-close'),

  // --- Recent files ------------------------------------------------------
  // Main asks the renderer to open a specific recent path. Returns unsubscribe.
  onOpenRecent: (handler) => {
    if (typeof handler !== 'function') return () => {}
    ipcRenderer.removeAllListeners('menu:open-recent')
    const listener = (_event, filePath) => handler(filePath)
    ipcRenderer.on('menu:open-recent', listener)
    return () => ipcRenderer.removeListener('menu:open-recent', listener)
  },

  // Open a specific path (importer + recent update).
  // -> { canceled?, path?, html?, format?, error? }
  openPath: (filePath) => ipcRenderer.invoke('file:open-path', filePath),

  // --- Image picker ------------------------------------------------------
  // -> { canceled, dataUrl?, error? }
  pickImage: () => ipcRenderer.invoke('file:pick-image'),

  // --- Drag-and-drop -----------------------------------------------------
  // Resolve the absolute filesystem path for a dropped/selected File object.
  // Synchronous; returns '' if it can't be resolved.
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },

  // Read an image at a known path into a data URL.
  // -> { canceled?, dataUrl?, error? }
  readImage: (path) => ipcRenderer.invoke('file:read-image', path),

  // --- File changed on disk ----------------------------------------------
  // Re-read the open document. `signature` is what the file looked like when
  // this window last synced; the main process compares it to what it has seen
  // so a reload cannot silently load something unexpected.
  // -> { ok, path?, html?, format?, readOnly?, signature?, error?, missing? }
  reloadFile: (signature) => ipcRenderer.invoke('file:reload', signature),

  // Subscribe to on-disk change notifications for the open document.
  // Events: { path, kind: 'changed'|'deleted', size? }
  // Returns an unsubscribe function. Removing the listener before adding a new
  // one keeps repeated mount/remount from stacking handlers.
  onFileChanged: (handler) => {
    if (typeof handler !== 'function') return () => {}
    const wrapped = (_event, evt) => handler(evt)
    ipcRenderer.removeAllListeners('file:changed')
    ipcRenderer.on('file:changed', wrapped)
    return () => ipcRenderer.removeListener('file:changed', wrapped)
  }
}

contextBridge.exposeInMainWorld('unbound', api)
