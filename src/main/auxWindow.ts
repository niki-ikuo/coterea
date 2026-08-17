import { BrowserWindow } from 'electron'
import { join } from 'path'
import { THEME_TITLEBAR_OVERLAY, THEME_WINDOW_BG, TITLEBAR_HEIGHT, type ThemeId } from '../shared/theme'
import { loadRenderer } from './loadRenderer'
import appIcon from '../../resources/icon.png?asset'

export const AUX_WINDOW_WIDTH = 480
export const AUX_WINDOW_HEIGHT = 520

export function createAuxWindow(options: {
  parent: BrowserWindow
  theme: ThemeId
  view: string
  title: string
}): BrowserWindow {
  const overlay = THEME_TITLEBAR_OVERLAY[options.theme]
  const parentBounds = options.parent.getBounds()
  const width = AUX_WINDOW_WIDTH
  const height = AUX_WINDOW_HEIGHT
  const win = new BrowserWindow({
    parent: options.parent,
    modal: false,
    width,
    height,
    x: Math.round(parentBounds.x + (parentBounds.width - width) / 2),
    y: Math.round(parentBounds.y + (parentBounds.height - height) / 2),
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    minimizable: true,
    autoHideMenuBar: true,
    title: options.title,
    icon: appIcon,
    show: false,
    frame: true,
    titleBarStyle: 'hidden',
    ...(process.platform === 'win32'
      ? {
          titleBarOverlay: {
            color: overlay.color,
            symbolColor: overlay.symbolColor,
            height: TITLEBAR_HEIGHT
          }
        }
      : {}),
    backgroundColor: THEME_WINDOW_BG[options.theme],
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--coterea-theme=${options.theme}`]
    }
  })
  win.setMenuBarVisibility(false)
  win.setMenu(null)
  win.on('ready-to-show', () => {
    win.show()
  })

  loadRenderer(win, options.view)
  return win
}
