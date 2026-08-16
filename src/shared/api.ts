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
    write: (filePath: string, content: string, encoding?: EncodingId) => Promise<void>
    saveAs: (suggestedName?: string) => Promise<SaveResult>
    confirmUnsaved: (names: string[]) => Promise<'save' | 'discard' | 'cancel'>
  }
  recent: {
    get: () => Promise<string[]>
  }
  collab: {
    start: (
      displayName: string,
      sessionName: string
    ) => Promise<{ ok: true; roomId: string; sessionName: string; localPeerId: string } | { ok: false; error: string }>
    join: (
      roomId: string,
      displayName: string
    ) => Promise<
      | { ok: true; roomId: string; sessionName: string; localPeerId: string; docs: DocMeta[]; color: string }
      | { ok: false; error: string }
    >
    leave: () => Promise<void>
    setDocs: (docs: DocMeta[]) => Promise<void>
    send: (msg: Record<string, unknown>, binary?: ArrayBuffer) => void
    onPeers: (cb: (payload: { peers: PeerInfo[] }) => void) => () => void
    onFrame: (cb: (payload: { msg: Record<string, unknown>; binary: ArrayBuffer }) => void) => () => void
    onEnded: (cb: (payload: { reason: string }) => void) => () => void
  }
  app: {
    confirmClose: () => Promise<void>
    onMenu: (cb: (payload: { action: string; extra?: string }) => void) => () => void
    onCloseRequest: (cb: () => void) => () => void
  }
}
