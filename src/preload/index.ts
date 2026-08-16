import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, DocMeta, ReadFileResult, SaveResult } from '../shared/types'
import type { EncodingId } from '../shared/encoding'

const api = {
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:set', patch)
  },
  fs: {
    open: (): Promise<string[]> => ipcRenderer.invoke('fs:open'),
    read: (filePath: string, encoding?: EncodingId): Promise<ReadFileResult | null> =>
      ipcRenderer.invoke('fs:read', filePath, encoding),
    write: (filePath: string, content: string, encoding?: EncodingId): Promise<void> =>
      ipcRenderer.invoke('fs:write', filePath, content, encoding),
    saveAs: (suggestedName?: string): Promise<SaveResult> => ipcRenderer.invoke('fs:saveAs', suggestedName),
    confirmUnsaved: (names: string[]): Promise<'save' | 'discard' | 'cancel'> =>
      ipcRenderer.invoke('fs:confirmUnsaved', names)
  },
  recent: {
    get: (): Promise<string[]> => ipcRenderer.invoke('recent:get')
  },
  collab: {
    start: (displayName: string, sessionName: string) =>
      ipcRenderer.invoke('collab:start', { displayName, sessionName }),
    join: (roomId: string, displayName: string) => ipcRenderer.invoke('collab:join', { roomId, displayName }),
    leave: () => ipcRenderer.invoke('collab:leave'),
    setDocs: (docs: DocMeta[]) => ipcRenderer.invoke('collab:setDocs', docs),
    send: (msg: Record<string, unknown>, binary?: ArrayBuffer) => ipcRenderer.send('collab:send', msg, binary),
    onPeers: (cb: (peers: unknown) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: unknown): void => cb(payload)
      ipcRenderer.on('collab:peer-update', listener)
      return () => ipcRenderer.removeListener('collab:peer-update', listener)
    },
    onFrame: (cb: (payload: { msg: Record<string, unknown>; binary: ArrayBuffer }) => void) => {
      const listener = (
        _e: Electron.IpcRendererEvent,
        payload: { msg: Record<string, unknown>; binary: ArrayBuffer }
      ): void => cb(payload)
      ipcRenderer.on('collab:frame', listener)
      return () => ipcRenderer.removeListener('collab:frame', listener)
    },
    onEnded: (cb: (payload: { reason: string }) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: { reason: string }): void => cb(payload)
      ipcRenderer.on('collab:ended', listener)
      return () => ipcRenderer.removeListener('collab:ended', listener)
    }
  },
  app: {
    confirmClose: () => ipcRenderer.invoke('app:confirmClose'),
    onMenu: (cb: (payload: { action: string; extra?: string }) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: { action: string; extra?: string }): void =>
        cb(payload)
      ipcRenderer.on('menu', listener)
      return () => ipcRenderer.removeListener('menu', listener)
    },
    onCloseRequest: (cb: () => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('app:close-request', listener)
      return () => ipcRenderer.removeListener('app:close-request', listener)
    }
  }
}

contextBridge.exposeInMainWorld('coterea', api)

export type CotereaApi = typeof api
