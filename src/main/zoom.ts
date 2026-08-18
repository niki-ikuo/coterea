import type { BrowserWindow, Input } from 'electron'
import { TITLEBAR_HEIGHT } from '../shared/theme'

const MIN_LEVEL = -6
const MAX_LEVEL = 8
const STEP = 0.5

let lastAt = 0
let lastAction: ZoomAction | null = null

export type ZoomAction = 'in' | 'out' | 'reset'

export function zoomIn(win: BrowserWindow): void {
  applyZoom(win, 'in')
}

export function zoomOut(win: BrowserWindow): void {
  applyZoom(win, 'out')
}

export function zoomReset(win: BrowserWindow): void {
  applyZoom(win, 'reset')
}

export function attachZoomShortcuts(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const action = zoomActionOf(input)
    if (!action) return
    event.preventDefault()
    applyZoom(win, action)
  })
}

function applyZoom(win: BrowserWindow, action: ZoomAction): void {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return
  const now = Date.now()
  if (lastAction === action && now - lastAt < 40) return
  lastAt = now
  lastAction = action
  const contents = win.webContents
  if (action === 'reset') {
    contents.setZoomLevel(0)
  } else {
    const next = contents.getZoomLevel() + (action === 'in' ? STEP : -STEP)
    contents.setZoomLevel(Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, next)))
  }
  syncTitleBarOverlayHeight(win)
}

export function titleBarOverlayHeight(zoomFactor: number): number {
  return Math.max(1, Math.ceil(TITLEBAR_HEIGHT * zoomFactor) - 1)
}

export function syncTitleBarOverlayHeight(win: BrowserWindow): void {
  if (process.platform !== 'win32' || win.isDestroyed() || win.webContents.isDestroyed()) return
  win.setTitleBarOverlay({ height: titleBarOverlayHeight(win.webContents.getZoomFactor()) })
}

function zoomActionOf(input: Input): ZoomAction | null {
  if (!input.control || input.alt || input.meta) return null
  const code = input.code
  const key = input.key
  if (code === 'NumpadAdd' || key === '+' || key === '=' || key === 'Add' || key === '＋' || key === '＝' || code === 'Semicolon') {
    return 'in'
  }
  if (
    code === 'NumpadSubtract' ||
    key === '-' ||
    key === '_' ||
    key === 'Subtract' ||
    key === '－' ||
    code === 'Minus'
  ) {
    return 'out'
  }
  if (code === 'Digit0' || code === 'Numpad0' || key === '0') {
    return 'reset'
  }
  return null
}
