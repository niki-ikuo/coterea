import { BrowserWindow } from 'electron'
import { parseTheme, type ThemeId } from '../shared/theme'
import { createAuxWindow } from './auxWindow'

let helpWindow: BrowserWindow | null = null
let askWindow: BrowserWindow | null = null

function mainParent(sender: Electron.WebContents): BrowserWindow | null {
  const win = BrowserWindow.fromWebContents(sender)
  if (!win || win.isDestroyed()) return null
  return win.getParentWindow() ?? win
}

export function showHelpWindow(parent: BrowserWindow, theme: ThemeId, docId = 'index.md'): void {
  const parsed = parseTheme(theme)
  if (helpWindow && !helpWindow.isDestroyed()) {
    helpWindow.webContents.send('help:open-doc', docId)
    helpWindow.focus()
    return
  }

  helpWindow = createAuxWindow({
    parent,
    theme: parsed,
    view: 'help',
    title: 'ヘルプ',
    width: 960,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    resizable: true,
    query: { doc: docId }
  })
  helpWindow.on('closed', () => {
    helpWindow = null
  })
}

export function showAiHelpWindow(parent: BrowserWindow, theme: ThemeId): void {
  const parsed = parseTheme(theme)
  if (askWindow && !askWindow.isDestroyed()) {
    askWindow.focus()
    return
  }

  askWindow = createAuxWindow({
    parent,
    theme: parsed,
    view: 'ai-help',
    title: 'AIヘルプ',
    width: 640,
    height: 560,
    minWidth: 480,
    minHeight: 400,
    resizable: true
  })
  askWindow.on('closed', () => {
    askWindow = null
  })
}

export function showHelpWindowFromSender(sender: Electron.WebContents, theme: ThemeId, docId?: string): void {
  const parent = mainParent(sender)
  if (!parent) return
  showHelpWindow(parent, theme, docId ?? 'index.md')
}

export function showAiHelpWindowFromSender(sender: Electron.WebContents, theme: ThemeId): void {
  const parent = mainParent(sender)
  if (!parent) return
  showAiHelpWindow(parent, theme)
}
