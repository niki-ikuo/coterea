import type {
  AboutInfo,
  AppSettings,
  DocMeta,
  ExternalChangeDecision,
  PeerInfo,
  ReadFileResult,
  SaveResult,
  WriteFileResult
} from './types'
import type { EncodingId } from './encoding'

export interface CotereaApi {
  settings: {
    get: () => Promise<AppSettings>
    set: (patch: Partial<AppSettings>) => Promise<AppSettings>
    onChange: (cb: (settings: AppSettings) => void) => () => void
  }
  fs: {
    open: () => Promise<string[]>
    read: (filePath: string, encoding?: EncodingId) => Promise<ReadFileResult | null>
    identity: (filePath: string) => Promise<string[]>
    peek: (filePath: string, encoding?: EncodingId) => Promise<string | null>
    write: (filePath: string, content: string, encoding?: EncodingId) => Promise<WriteFileResult>
    saveAs: (suggestedName?: string) => Promise<SaveResult>
    confirmUnsaved: (names: string[]) => Promise<'save' | 'discard' | 'cancel'>
    confirmExternalChange: (filePath: string) => Promise<ExternalChangeDecision>
    watch: (filePath: string) => Promise<void>
    unwatch: (filePath: string) => Promise<void>
    noteOwnWrite: (filePath: string, meta: WriteFileResult) => Promise<void>
    onChanged: (cb: (payload: { path: string; mtimeMs: number; size: number }) => void) => () => void
  }
  recent: {
    get: () => Promise<string[]>
  }
  collab: {
    enable: (displayName: string) => Promise<{ localPeerId: string }>
    setDisplayName: (displayName: string) => Promise<void>
    setDocs: (docs: DocMeta[]) => Promise<void>
    startHost: () => Promise<{ ok: true; tcpPort: number } | { ok: false; error: string }>
    join: (host: string, port: number) => Promise<{ ok: true } | { ok: false; error: string }>
    leave: () => Promise<void>
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
        tcpPort?: number
        listenAddresses?: string[]
        holdHost?: boolean
      }) => void
    ) => () => void
    onPeers: (cb: (payload: { peers: PeerInfo[] }) => void) => () => void
    onFrame: (cb: (payload: { msg: Record<string, unknown>; binary: ArrayBuffer }) => void) => () => void
  }
  app: {
    confirmClose: () => Promise<void>
    openExternal: (url: string) => Promise<void>
    showSettings: () => Promise<void>
    getAboutInfo: () => Promise<AboutInfo>
    writeClipboard: (text: string) => Promise<void>
    onMenu: (cb: (payload: { action: string; extra?: string }) => void) => () => void
    onCloseRequest: (cb: () => void) => () => void
    consumeLaunchFiles: () => Promise<string[]>
    onOpenFiles: (cb: (paths: string[]) => void) => () => void
    popupMenu: (label: string, x: number, y: number) => void
  }
}
