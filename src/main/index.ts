import { app, BrowserWindow, protocol, net, session, shell, ipcMain, dialog } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

// media://local/<pack>/<file> serves sample packs. Registered before the app is ready.
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
])

// Audio must be able to start on the first key press without a click first.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.setAppUserModelId('com.khaled.maestro')

// one Maestro at a time: opening a .maestro file while it runs brings it to the front with that piece
if (!app.requestSingleInstanceLock()) app.quit()

let win: BrowserWindow | null = null
let pendingFile: string | null = fileFromArgs(process.argv)

function fileFromArgs(argv: string[]): string | null {
  return argv.slice(1).find((a) => a.toLowerCase().endsWith('.maestro')) ?? null
}

function samplesRoot(): string {
  return app.isPackaged ? join(process.resourcesPath, 'samples') : join(app.getAppPath(), 'resources', 'samples')
}

// ---------------------------------------------------------------- window size and place are remembered
interface WinState { width: number; height: number; x?: number; y?: number; maximized?: boolean }
const stateFile = (): string => join(app.getPath('userData'), 'window.json')
function loadState(): WinState {
  try { return { ...{ width: 1440, height: 940 }, ...(JSON.parse(readFileSync(stateFile(), 'utf8')) as Partial<WinState>) } } catch { return { width: 1440, height: 940 } }
}
function saveState(w: BrowserWindow): void {
  try {
    const b = w.getNormalBounds()
    writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: w.isMaximized() }))
  } catch { /* not important */ }
}

function createWindow(): void {
  const st = loadState()
  win = new BrowserWindow({
    width: st.width,
    height: st.height,
    x: st.x,
    y: st.y,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    title: 'Maestro',
    icon: join(app.getAppPath(), 'build', 'icon.png'),
    backgroundColor: '#1E1220',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false // keep audio timing steady when the window is in the background
    }
  })
  if (st.maximized) win.maximize()
  win.once('ready-to-show', () => win?.show())
  win.on('close', () => { if (win) saveState(win) })
  win.on('closed', () => { win = null })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault()) // the app never navigates away
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.on('second-instance', (_e, argv) => {
  const f = fileFromArgs(argv)
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
    if (f) win.webContents.send('piece:open-file', f)
  }
})

// ---------------------------------------------------------------- updates from GitHub releases
type UpdateState = { state: 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'error'; version?: string; percent?: number; message?: string }
function sendUpdate(s: UpdateState): void { win?.webContents.send('update:status', s) }
function setupUpdater(): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => sendUpdate({ state: 'checking' }))
  autoUpdater.on('update-not-available', () => sendUpdate({ state: 'none' }))
  autoUpdater.on('update-available', (i) => sendUpdate({ state: 'downloading', version: i.version, percent: 0 }))
  autoUpdater.on('download-progress', (p) => sendUpdate({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (i) => sendUpdate({ state: 'ready', version: i.version }))
  autoUpdater.on('error', (e) => sendUpdate({ state: 'error', message: e?.message ?? String(e) }))
  setTimeout(() => void autoUpdater.checkForUpdates().catch(() => undefined), 4000)
}

void app.whenReady().then(() => {
  const root = resolve(samplesRoot())
  protocol.handle('media', async (request) => {
    const url = new URL(request.url)
    const file = resolve(root, '.' + decodeURIComponent(url.pathname))
    if (!file.startsWith(root + sep)) return new Response('Not found', { status: 404 }) // never leave the samples folder
    const res = await net.fetch(pathToFileURL(file).toString())
    const headers = new Headers(res.headers)
    headers.set('Access-Control-Allow-Origin', '*') // the dev renderer runs on http://localhost
    return new Response(res.body, { status: res.status, headers })
  })

  // only the microphone-free, camera-free basics: deny every permission request
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))

  // pieces are saved as .maestro files (JSON) wherever the player chooses
  const FILTERS = [{ name: 'Maestro piece', extensions: ['maestro'] }]
  ipcMain.handle('piece:save', async (e, arg: { data: string; path: string | null; name: string }) => {
    let path = arg.path
    if (!path) {
      const w = BrowserWindow.fromWebContents(e.sender)
      const r = await dialog.showSaveDialog(w!, { title: 'Save the piece', defaultPath: `${arg.name || 'My piece'}.maestro`, filters: FILTERS })
      if (r.canceled || !r.filePath) return null
      path = r.filePath
    }
    if (typeof arg.data !== 'string' || arg.data.length > 50_000_000) throw new Error('The piece is too large to save.')
    await writeFile(path, arg.data, 'utf8')
    return { path, name: basename(path).replace(/\.maestro$/i, '') }
  })
  ipcMain.handle('piece:open', async (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    const r = await dialog.showOpenDialog(w!, { title: 'Open a piece', filters: FILTERS, properties: ['openFile'] })
    if (r.canceled || !r.filePaths[0]) return null
    const path = r.filePaths[0]
    return { path, name: basename(path).replace(/\.maestro$/i, ''), data: await readFile(path, 'utf8') }
  })
  // a .maestro file opened from Windows (double-click): the renderer asks for it once it is ready
  ipcMain.handle('piece:pending', () => { const f = pendingFile; pendingFile = null; return f })
  ipcMain.handle('piece:read', async (_e, path: string) => {
    if (typeof path !== 'string' || !path.toLowerCase().endsWith('.maestro')) throw new Error('Not a Maestro piece.')
    return { path, name: basename(path).replace(/\.maestro$/i, ''), data: await readFile(path, 'utf8') }
  })

  // exported audio (.wav) and MIDI (.mid)
  ipcMain.handle('export:save', async (e, arg: { data: ArrayBuffer; name: string; kind: 'wav' | 'mid' }) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    const ext = arg.kind === 'wav' ? 'wav' : 'mid'
    const r = await dialog.showSaveDialog(w!, { title: arg.kind === 'wav' ? 'Save the audio' : 'Save the MIDI file', defaultPath: `${arg.name}.${ext}`,
      filters: [arg.kind === 'wav' ? { name: 'WAV audio', extensions: ['wav'] } : { name: 'MIDI file', extensions: ['mid'] }] })
    if (r.canceled || !r.filePath) return null
    if (!(arg.data instanceof ArrayBuffer) || arg.data.byteLength > 2_000_000_000) throw new Error('The export is not valid.')
    await writeFile(r.filePath, Buffer.from(arg.data))
    return { path: r.filePath }
  })

  ipcMain.handle('app:info', () => ({ version: app.getVersion(), packaged: app.isPackaged }))
  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) return { state: 'none', message: 'Updates work in the installed app.' }
    try { await autoUpdater.checkForUpdates(); return { state: 'checking' } } catch (e) { return { state: 'error', message: String(e) } }
  })
  ipcMain.handle('update:install', () => { autoUpdater.quitAndInstall(false, true) })

  if (app.isPackaged) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self' media:; media-src 'self' media: blob:"
          ]
        }
      })
    })
  }

  createWindow()
  setupUpdater()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
