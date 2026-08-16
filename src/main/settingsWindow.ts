import { BrowserWindow } from 'electron'
import type { ThemeId } from '../shared/theme'
import { createAuxWindow } from './auxWindow'

let settingsWindow: BrowserWindow | null = null

export function showSettingsWindow(parent: BrowserWindow, theme: ThemeId): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }

  settingsWindow = createAuxWindow({
    parent,
    theme,
    view: 'settings',
    title: '設定'
  })
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}
