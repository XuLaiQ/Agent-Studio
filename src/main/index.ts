import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'
import { ptyManager } from './ptyManager'

// Title bar overlay colors per theme. Keep in sync with --titlebar-bg / --text
// in src/renderer/src/styles.css so the native caption buttons blend in.
const TITLE_BAR_OVERLAY = {
  dark: { color: '#111118', symbolColor: '#f5f5f7', height: 34 },
  light: { color: '#f8f9fa', symbolColor: '#1a1a2e', height: 34 }
} as const

// Chromium logs noisy "Unable to move the cache" / "Gpu Cache Creation failed"
// errors on Windows when its default cache dir isn't writable (stale lock from a
// previous run, AV, or OneDrive-synced AppData). Point the disk cache at a
// dedicated writable folder and skip the GPU shader disk cache to silence them.
app.commandLine.appendSwitch('disk-cache-dir', join(app.getPath('userData'), 'Cache'))
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Agent Studio',
    backgroundColor: '#1e1e2e',
    titleBarStyle: 'hidden',
    titleBarOverlay: TITLE_BAR_OVERLAY.dark,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite injects ELECTRON_RENDERER_URL in dev.
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 创建窗口后，移除菜单
  win.setMenu(null);
}

app.whenReady().then(() => {
  registerIpc()

  // Recolor the native caption-button overlay when the renderer toggles theme.
  ipcMain.on('window:setTitleBarTheme', (event, theme: 'dark' | 'light') => {
    const sender = BrowserWindow.fromWebContents(event.sender)
    sender?.setTitleBarOverlay(TITLE_BAR_OVERLAY[theme] ?? TITLE_BAR_OVERLAY.dark)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  ptyManager.killAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => ptyManager.killAll())
