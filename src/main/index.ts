import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { CollabHub } from './collab/hub'
import { AppStore } from './store'
import { buildMenu } from './menu'
import { confirmUnsaved, openFiles, readTextFile, saveAs, warnLargeFile, writeTextFile } from './fs'
import type { ControlMessage } from './collab/frame'
import type { DocMeta } from '../shared/types'
import { parseEncoding } from './encoding'
import { DEFAULT_ENCODING } from '../shared/encoding'

const store = new AppStore()
const hub = new CollabHub()
let mainWindow: BrowserWindow | null = null
let allowClose = false

function sendMenu(action: string, extra?: string): void {
  mainWindow?.webContents.send('menu', { action, extra })
}

async function refreshMenu(): Promise<void> {
  if (!mainWindow) return
  await store.load()
  buildMenu(mainWindow, store.getRecent(), sendMenu)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    show: false,
    autoHideMenuBar: false,
    title: 'Coterea',
    backgroundColor: '#1c1917',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  hub.attachWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (allowClose) return
    event.preventDefault()
    mainWindow?.webContents.send('app:close-request')
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('settings:get', async () => {
    await store.load()
    return store.getSettings()
  })
  ipcMain.handle('settings:set', async (_e, patch: { displayName?: string }) => {
    const next = await store.setSettings(patch)
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
  ipcMain.handle('fs:write', async (_e, filePath: string, content: string, encoding?: string) => {
    await writeTextFile(filePath, content, parseEncoding(encoding) ?? DEFAULT_ENCODING)
    await store.addRecent(filePath)
    await refreshMenu()
  })
  ipcMain.handle('fs:saveAs', async (_e, suggestedName?: string) => {
    if (!mainWindow) return { canceled: true, path: null }
    return saveAs(mainWindow, suggestedName)
  })
  ipcMain.handle('fs:confirmUnsaved', async (_e, names: string[]) => {
    if (!mainWindow) return 'cancel'
    return confirmUnsaved(mainWindow, names)
  })
  ipcMain.handle('collab:start', async (_e, payload: { displayName: string; sessionName: string }) => {
    try {
      const result = await hub.startHost(payload.displayName, payload.sessionName)
      return { ok: true, ...result, localPeerId: hub.localPeerId }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle('collab:join', async (_e, payload: { roomId: string; displayName: string }) => {
    try {
      const result = await hub.join(payload.roomId, payload.displayName)
      return { ok: true, ...result, localPeerId: hub.localPeerId }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle('collab:leave', async () => {
    await hub.leave()
  })
  ipcMain.handle('collab:setDocs', (_e, docs: DocMeta[]) => {
    hub.setSharedDocs(docs)
  })
  ipcMain.on('collab:send', (_e, msg: ControlMessage, binary?: ArrayBuffer) => {
    hub.sendFromRenderer(msg, binary ? Buffer.from(binary) : undefined)
  })
  ipcMain.handle('app:confirmClose', () => {
    allowClose = true
    mainWindow?.close()
  })
  ipcMain.handle('recent:get', async () => {
    await store.load()
    return store.getRecent()
  })
}

app.whenReady().then(async () => {
  app.setName('Coterea')
  electronApp.setAppUserModelId('app.coterea.desktop')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  await store.load()
  registerIpc()
  createWindow()
  await refreshMenu()
})

app.on('window-all-closed', () => {
  hub.dispose()
  if (process.platform !== 'darwin') app.quit()
})
