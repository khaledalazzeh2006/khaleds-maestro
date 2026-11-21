import { contextBridge, ipcRenderer } from 'electron'

type UpdateState = { state: string; version?: string; percent?: number; message?: string }

contextBridge.exposeInMainWorld('maestro', {
  platform: process.platform,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
  /** save a piece; with no path the player picks where. Resolves to null if they cancel. */
  savePiece: (data: string, path: string | null, name: string) => ipcRenderer.invoke('piece:save', { data, path, name }),
  /** let the player pick a .maestro file; resolves to null if they cancel */
  openPiece: () => ipcRenderer.invoke('piece:open'),
  /** a piece Windows asked us to open (double-clicked file), once */
  pendingPiece: () => ipcRenderer.invoke('piece:pending'),
  readPiece: (path: string) => ipcRenderer.invoke('piece:read', path),
  onOpenFile: (cb: (path: string) => void) => { ipcRenderer.on('piece:open-file', (_e, p: string) => cb(p)) },
  /** save exported audio or MIDI where the player chooses; null if they cancel */
  exportFile: (data: ArrayBuffer, name: string, kind: 'wav' | 'mid') => ipcRenderer.invoke('export:save', { data, name, kind }),
  appInfo: () => ipcRenderer.invoke('app:info'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdate: (cb: (s: UpdateState) => void) => { ipcRenderer.on('update:status', (_e, s: UpdateState) => cb(s)) }
})
