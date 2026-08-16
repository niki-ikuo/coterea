import { contextBridge, ipcRenderer } from 'electron'
import type { AboutInfo, AppSettings, DocMeta, ReadFileResult, SaveResult } from '../shared/types'
import type { EncodingId } from '../shared/encoding'

const api = {
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:set', patch),
    onChange: (cb: (settings: AppSettings) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, settings: AppSettings): void => cb(settings)
      ipcRenderer.on('settings:changed', listener)
      return () => ipcRenderer.removeListener('settings:changed', listener)
    }
  },
  fs: {
    open: (): Promise<string[]> => ipcRenderer.invoke('fs:open'),
    read: (filePath: string, encoding?: EncodingId): Promise<ReadFileResult | null> =>
      ipcRenderer.invoke('fs:read', filePath, encoding),
    identity: (filePath: string): Promise<string[]> => ipcRenderer.invoke('fs:identity', filePath),
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
    enable: (displayName: string) => ipcRenderer.invoke('collab:enable', displayName),
    setDisplayName: (displayName: string) => ipcRenderer.invoke('collab:setDisplayName', displayName),
    setDocs: (docs: DocMeta[]) => ipcRenderer.invoke('collab:setDocs', docs),
    send: (msg: Record<string, unknown>, binary?: ArrayBuffer) => ipcRenderer.send('collab:send', msg, binary),
    onState: (cb: (payload: unknown) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: unknown): void => cb(payload)
      ipcRenderer.on('collab:state', listener)
      return () => ipcRenderer.removeListener('collab:state', listener)
    },
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
    }
  },
  app: {
    confirmClose: () => ipcRenderer.invoke('app:confirmClose'),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
    showSettings: (): Promise<void> => ipcRenderer.invoke('app:showSettings'),
    getAboutInfo: (): Promise<AboutInfo> => ipcRenderer.invoke('app:getAboutInfo'),
    writeClipboard: (text: string): Promise<void> => ipcRenderer.invoke('app:writeClipboard', text),
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
    },
    consumeLaunchFiles: (): Promise<string[]> => ipcRenderer.invoke('app:consumeLaunchFiles'),
    onOpenFiles: (cb: (paths: string[]) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, paths: string[]): void => cb(paths)
      ipcRenderer.on('app:open-files', listener)
      return () => ipcRenderer.removeListener('app:open-files', listener)
    },
    popupMenu: (label: string, x: number, y: number): void => {
      ipcRenderer.send('menu:popup', label, x, y)
    }
  }
}

contextBridge.exposeInMainWorld('coterea', api)

export type CotereaApi = typeof api
