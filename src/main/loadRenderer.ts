import { join } from 'path'
import type { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'

export function loadRenderer(win: BrowserWindow, view?: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    if (!view) {
      void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
      return
    }
    const url = new URL(process.env['ELECTRON_RENDERER_URL'])
    url.searchParams.set('view', view)
    void win.loadURL(url.toString())
    return
  }
  void win.loadFile(join(__dirname, '../renderer/index.html'), view ? { query: { view } } : undefined)
}
