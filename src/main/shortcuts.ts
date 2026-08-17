import type { BrowserWindow, Input } from 'electron'
import { menuLabelForKey } from '../shared/appMenus'

type SendMenu = (action: string, extra?: string) => void

export function attachAppShortcuts(win: BrowserWindow, send: SendMenu): void {
  let altChord = false
  let altUsed = false

  win.webContents.on('before-input-event', (event, input) => {
    if (handleTabSwitch(event, input, send)) return
    if (handleAltMenu(event, input, send, () => altChord, (v) => {
      altChord = v
    }, () => altUsed, (v) => {
      altUsed = v
    })) {
      return
    }
  })
}

function handleTabSwitch(
  event: Electron.Event,
  input: Input,
  send: SendMenu
): boolean {
  if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return false
  if (input.key === 'Tab' || input.code === 'Tab') {
    event.preventDefault()
    send(input.shift ? 'prev-tab' : 'next-tab')
    return true
  }
  if (input.code === 'PageDown' || input.key === 'PageDown') {
    event.preventDefault()
    send('next-tab')
    return true
  }
  if (input.code === 'PageUp' || input.key === 'PageUp') {
    event.preventDefault()
    send('prev-tab')
    return true
  }
  return false
}

function handleAltMenu(
  event: Electron.Event,
  input: Input,
  send: SendMenu,
  getChord: () => boolean,
  setChord: (v: boolean) => void,
  getUsed: () => boolean,
  setUsed: (v: boolean) => void
): boolean {
  const isAlt =
    input.code === 'AltLeft' ||
    input.code === 'AltRight' ||
    input.key === 'Alt' ||
    input.key === 'AltGraph'

  if (input.type === 'keyDown' && isAlt && !input.control && !input.meta) {
    setChord(true)
    setUsed(false)
    return true
  }

  if (input.type === 'keyDown' && input.alt && !input.control && !input.meta && !isAlt) {
    const label = menuLabelForKey(input)
    setUsed(true)
    setChord(false)
    if (!label) return false
    event.preventDefault()
    send('popup-app-menu', label)
    return true
  }

  if (input.type === 'keyUp' && isAlt) {
    if (getChord() && !getUsed()) {
      event.preventDefault()
      send('focus-app-menu')
    }
    setChord(false)
    setUsed(false)
    return true
  }

  return false
}
