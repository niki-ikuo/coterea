import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeTheme, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { CollabHub } from './collab/hub'
import { AppStore } from './store'
import { buildMenu } from './menu'
import { confirmExternalChange, confirmUnsaved, openFiles, peekTextFile, readTextFile, saveAs, warnLargeFile, writeTextFile } from './fs'
import { FileWatcher } from './fileWatch'
import { resolveFileIds } from './fileIdentity'
import type { ControlMessage } from './collab/frame'
import type { DocMeta } from '../shared/types'
import { parseEncoding } from './encoding'
import { DEFAULT_ENCODING } from '../shared/encoding'
import { isDarkTheme, parseTheme, THEME_TITLEBAR_OVERLAY, THEME_WINDOW_BG, TITLEBAR_HEIGHT, type ThemeId } from '../shared/theme'
import { loadRenderer } from './loadRenderer'
import { filesFromArgv } from './openFromShell'
import { attachZoomShortcuts } from './zoom'
import { getAboutInfo } from './about'
import { showSettingsWindow } from './settingsWindow'
import appIcon from '../../resources/icon.png?asset'

const store = new AppStore()
const hub = new CollabHub()
const fileWatcher = new FileWatcher()
let mainWindow: BrowserWindow | null = null
let allowClose = false
let launchFiles: string[] = []
let rendererReady = false

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function queueOrSendFiles(paths: string[]): void {
  const unique = [...new Set(paths)]
  if (unique.length === 0) return
  if (rendererReady && mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('app:open-files', unique)
    focusMainWindow()
    return
  }
  for (const filePath of unique) {
    if (!launchFiles.includes(filePath)) launchFiles.push(filePath)
  }
}

function sendMenu(action: string, extra?: string): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  mainWindow.webContents.send('menu', { action, extra })
}

async function refreshMenu(): Promise<void> {
  if (!mainWindow) return
  await store.load()
  buildMenu(
    mainWindow,
    store.getRecent(),
    sendMenu,
    parseTheme(store.getSettings().theme),
    store.getSettings().collabPaneVisible === true
  )
  if (!mainWindow.isDestroyed()) {
    mainWindow.setMenuBarVisibility(false)
  }
}

function titleBarOverlayOptions(theme: ThemeId): Electron.TitleBarOverlay {
  const overlay = THEME_TITLEBAR_OVERLAY[theme]
  return {
    color: overlay.color,
    symbolColor: overlay.symbolColor,
    height: TITLEBAR_HEIGHT
  }
}

function applyWindowChrome(win: BrowserWindow, theme: ThemeId): void {
  nativeTheme.themeSource = isDarkTheme(theme) ? 'dark' : 'light'
  win.setBackgroundColor(THEME_WINDOW_BG[theme])
  if (process.platform === 'win32') {
    win.setTitleBarOverlay(titleBarOverlayOptions(theme))
  }
}

function createWindow(): void {
  const theme = parseTheme(store.getSettings().theme)
  nativeTheme.themeSource = isDarkTheme(theme) ? 'dark' : 'light'
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    show: false,
    frame: true,
    titleBarStyle: 'hidden',
    ...(process.platform === 'win32' ? { titleBarOverlay: titleBarOverlayOptions(theme) } : {}),
    autoHideMenuBar: true,
    title: 'Coterea',
    icon: appIcon,
    backgroundColor: THEME_WINDOW_BG[theme],
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--coterea-theme=${theme}`]
    }
  })
  mainWindow.setMenuBarVisibility(false)

  hub.attachWindow(mainWindow)
  fileWatcher.attachWindow(mainWindow)
  attachZoomShortcuts(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('close', (event) => {
    if (allowClose) return
    event.preventDefault()
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
    mainWindow.webContents.send('app:close-request')
  })

  loadRenderer(mainWindow)
}

function registerIpc(): void {
  ipcMain.handle('settings:get', async () => {
    await store.load()
    return store.getSettings()
  })
  ipcMain.handle('settings:set', async (_e, patch: Partial<import('../shared/types').AppSettings>) => {
    const next = await store.setSettings(patch)
    const theme = parseTheme(next.theme)
    nativeTheme.themeSource = isDarkTheme(theme) ? 'dark' : 'light'
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      applyWindowChrome(win, theme)
      if (!win.webContents.isDestroyed()) win.webContents.send('settings:changed', next)
    }
    await refreshMenu()
    return next
  })
  ipcMain.handle('fs:open', async () => {
    if (!mainWindow) return []
    return openFiles(mainWindow)
  })
  ipcMain.handle('fs:read', async (_e, filePath: string, encoding?: string) => {
    const result = await readTextFile(filePath, parseEncoding(encoding))
    if (result.tooLarge && mainWindow) {
      const ok = await warnLargeFile(mainWindow, filePath)
      if (!ok) return null
    }
    await store.addRecent(filePath)
    await refreshMenu()
    return result
  })
  ipcMain.handle('fs:identity', async (_e, filePath: string) => {
    return resolveFileIds(filePath)
  })
  ipcMain.handle('fs:peek', async (_e, filePath: string, encoding?: string) => {
    return peekTextFile(filePath, parseEncoding(encoding))
  })
  ipcMain.handle('fs:write', async (_e, filePath: string, content: string, encoding?: string) => {
    const result = await writeTextFile(filePath, content, parseEncoding(encoding) ?? DEFAULT_ENCODING)
    fileWatcher.noteOwnWrite(filePath, result)
    await store.addRecent(filePath)
    await refreshMenu()
    return result
  })
  ipcMain.handle('fs:saveAs', async (_e, suggestedName?: string) => {
    if (!mainWindow) return { canceled: true, path: null }
    return saveAs(mainWindow, suggestedName)
  })
  ipcMain.handle('fs:confirmUnsaved', async (_e, names: string[]) => {
    if (!mainWindow) return 'cancel'
    return confirmUnsaved(mainWindow, names)
  })
  ipcMain.handle('fs:confirmExternalChange', async (_e, filePath: string) => {
    if (!mainWindow) return 'ignore'
    return confirmExternalChange(mainWindow, filePath)
  })
  ipcMain.handle('fs:watch', (_e, filePath: string) => {
    if (typeof filePath === 'string' && filePath) fileWatcher.watch(filePath)
  })
  ipcMain.handle('fs:unwatch', (_e, filePath: string) => {
    if (typeof filePath === 'string' && filePath) fileWatcher.unwatch(filePath)
  })
  ipcMain.handle('collab:enable', async (_e, displayName: string) => {
    return hub.enable(displayName)
  })
  ipcMain.handle('collab:setDisplayName', (_e, displayName: string) => {
    hub.setDisplayName(displayName)
  })
  ipcMain.handle('collab:setDocs', (_e, docs: DocMeta[]) => {
    hub.setSharedDocs(docs)
  })
  ipcMain.handle('collab:startHost', () => hub.startHost())
  ipcMain.handle('collab:join', (_e, host: string, port: number) => hub.joinManual(host, port))
  ipcMain.handle('collab:leave', () => hub.leave())
  ipcMain.on('collab:send', (_e, msg: ControlMessage, binary?: ArrayBuffer) => {
    hub.sendFromRenderer(msg, binary ? Buffer.from(binary) : undefined)
  })
  ipcMain.handle('app:confirmClose', () => {
    allowClose = true
    mainWindow?.close()
  })
  ipcMain.handle('app:openExternal', async (_e, url: string) => {
    if (!/^https?:\/\//i.test(url)) return
    await shell.openExternal(url)
  })
  ipcMain.handle('app:showSettings', (event) => {
    const from = BrowserWindow.fromWebContents(event.sender)
    const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : from
    if (!parent) return
    showSettingsWindow(parent, parseTheme(store.getSettings().theme))
  })
  ipcMain.handle('app:getAboutInfo', () => getAboutInfo())
  ipcMain.handle('app:writeClipboard', (_e, text: unknown) => {
    if (typeof text !== 'string') return
    clipboard.writeText(text)
  })
  ipcMain.handle('app:consumeLaunchFiles', () => {
    rendererReady = true
    const files = launchFiles
    launchFiles = []
    return files
  })
  ipcMain.on('menu:popup', (event, label: unknown, x: unknown, y: unknown) => {
    if (typeof label !== 'string' || typeof x !== 'number' || typeof y !== 'number') return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    const item = Menu.getApplicationMenu()?.items.find((entry) => entry.label === label)
    const submenu = item?.submenu
    if (!submenu) return
    const zoom = event.sender.getZoomFactor()
    submenu.popup({
      window: win,
      x: Math.round(x * zoom),
      y: Math.round(y * zoom)
    })
  })
  ipcMain.handle('recent:get', async () => {
    await store.load()
    return store.getRecent()
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    queueOrSendFiles(filesFromArgv(argv))
    focusMainWindow()
  })

  app.whenReady().then(async () => {
    app.setName('Coterea')
    electronApp.setAppUserModelId('app.coterea.desktop')
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })
    await store.load()
    registerIpc()
    queueOrSendFiles(filesFromArgv(process.argv))
    createWindow()
    await refreshMenu()
  })

  app.on('window-all-closed', () => {
    hub.dispose()
    fileWatcher.dispose()
    if (process.platform !== 'darwin') app.quit()
  })
}
