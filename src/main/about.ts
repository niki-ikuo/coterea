import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { statSync } from 'fs'
import os from 'os'
import type { AboutInfo } from '../shared/types'
import type { ThemeId } from '../shared/theme'
import { createAuxWindow } from './auxWindow'

let aboutWindow: BrowserWindow | null = null

function installFlavor(): string {
  if (!app.isPackaged) return '開発'
  const exe = app.getPath('exe').toLowerCase()
  if (exe.includes('program files')) return 'システムセットアップ'
  return 'ユーザーセットアップ'
}

function builtAt(): number {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'app.asar'), app.getPath('exe')]
    : [join(__dirname, 'index.js')]
  for (const path of candidates) {
    try {
      return statSync(path).mtimeMs
    } catch {
      /* try next */
    }
  }
  return Date.now()
}

export function getAboutInfo(): AboutInfo {
  const year = new Date().getFullYear()
  return {
    name: app.getName(),
    version: app.getVersion(),
    flavor: installFlavor(),
    builtAt: builtAt(),
    copyright: `Copyright © ${year} Coterea. All rights reserved.`,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    os: `${os.type()} ${os.arch()} ${os.release()}`
  }
}

export function showAboutWindow(parent: BrowserWindow, theme: ThemeId): void {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus()
    return
  }

  aboutWindow = createAuxWindow({
    parent,
    theme,
    view: 'about',
    title: 'Coterea'
  })
  aboutWindow.on('closed', () => {
    aboutWindow = null
  })
}
