import type { AppSettings, DocMeta, PeerInfo, ReadFileResult, SaveResult } from './types'
import type { EncodingId } from './encoding'

export interface CotereaApi {
  settings: {
    get: () => Promise<AppSettings>
    set: (patch: Partial<AppSettings>) => Promise<AppSettings>
  }
  fs: {
    open: () => Promise<string[]>
    read: (filePath: string, encoding?: EncodingId) => Promise<ReadFileResult | null>
    identity: (filePath: string) => Promise<string[]>
    write: (filePath: string, content: string, encoding?: EncodingId) => Promise<void>
    saveAs: (suggestedName?: string) => Promise<SaveResult>
    confirmUnsaved: (names: string[]) => Promise<'save' | 'discard' | 'cancel'>
  }
  recent: {
    get: () => Promise<string[]>
  }
  collab: {
    enable: (displayName: string) => Promise<{ localPeerId: string }>
    setDisplayName: (displayName: string) => Promise<void>
    setDocs: (docs: DocMeta[]) => Promise<void>
    send: (msg: Record<string, unknown>, binary?: ArrayBuffer) => void
    onState: (
      cb: (payload: {
        status: import('./types').CollabStatus
        role: 'solo' | 'host' | 'guest'
        localPeerId: string
        localColor: string
        startedAt?: number
        peers: PeerInfo[] | undefined
        udpPeerCount?: number
        tcpPeerCount?: number
        connectError?: string | null
        netHint?: string | null
      }) => void
    ) => () => void
    onPeers: (cb: (payload: { peers: PeerInfo[] }) => void) => () => void
    onFrame: (cb: (payload: { msg: Record<string, unknown>; binary: ArrayBuffer }) => void) => () => void
  }
  app: {
    confirmClose: () => Promise<void>
    openExternal: (url: string) => Promise<void>
    onMenu: (cb: (payload: { action: string; extra?: string }) => void) => () => void
    onCloseRequest: (cb: () => void) => () => void
    consumeLaunchFiles: () => Promise<string[]>
    onOpenFiles: (cb: (paths: string[]) => void) => () => void
  }
}
