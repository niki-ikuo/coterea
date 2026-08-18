import type {
  AboutInfo,
  AppSettings,
  ExternalChangeDecision,
  PeerInfo,
  ReadFileResult,
  SaveResult,
  WriteFileResult
} from './types'
import type { EncodingId } from './encoding'
import type { ChatHistoryFile, ChatMode, ProposedEdit } from './ai'

export type AiStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; detail: string }
  | { type: 'proposal'; messageId: string; note?: string; proposal: ProposedEdit }
  | { type: 'done' }
  | { type: 'error'; message: string }

export type AiToolRequest =
  | { callId: string; name: 'list_open_tabs' }
  | { callId: string; name: 'read_tab'; tabId: string }
  | { callId: string; name: 'snapshot_tab'; tabId: string }

export interface AiChatRequest {
  requestId: string
  mode: ChatMode
  messages: { role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }[]
  activeTabId: string | null
  selection?: { from: number; to: number; text: string } | null
}

export interface CotereaApi {
  settings: {
    get: () => Promise<AppSettings>
    set: (patch: Partial<AppSettings>) => Promise<AppSettings>
    onChange: (cb: (settings: AppSettings) => void) => () => void
  }
  fs: {
    open: () => Promise<string[]>
    read: (filePath: string, encoding?: EncodingId) => Promise<ReadFileResult | import('./openPolicy').UnsupportedOpen | null>
    warnUnsupported: (items: import('./openPolicy').UnsupportedOpen[]) => Promise<void>
    identity: (filePath: string) => Promise<string[]>
    peek: (filePath: string, encoding?: EncodingId) => Promise<string | null>
    stat: (filePath: string) => Promise<WriteFileResult | null>
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
  session: {
    get: () => Promise<import('./session').EditorSession>
    set: (session: import('./session').EditorSession) => Promise<import('./session').EditorSession>
  }
  collab: {
    enable: (displayName: string) => Promise<{ localPeerId: string }>
    setDisplayName: (displayName: string) => Promise<void>
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
    showCollabNotice: () => Promise<void>
    writeClipboard: (text: string) => Promise<void>
    onMenu: (cb: (payload: { action: string; extra?: string }) => void) => () => void
    onCloseRequest: (cb: () => void) => () => void
    consumeLaunchFiles: () => Promise<string[]>
    onOpenFiles: (cb: (paths: string[]) => void) => () => void
    popupMenu: (label: string, x: number, y: number) => void
  }
  ai: {
    status: () => Promise<{ hasKey: boolean; configured: boolean }>
    setKey: (key: string) => Promise<{ hasKey: boolean; configured: boolean }>
    start: (req: AiChatRequest) => Promise<{ ok: true } | { ok: false; error: string }>
    stop: (requestId: string) => Promise<void>
    toolResult: (payload: { requestId: string; callId: string; result: string }) => void
    onEvent: (cb: (payload: { requestId: string; event: AiStreamEvent }) => void) => () => void
    onTool: (cb: (payload: { requestId: string } & AiToolRequest) => void) => () => void
    onStatus: (cb: (payload: { hasKey: boolean; configured: boolean }) => void) => () => void
  }
  chat: {
    get: () => Promise<ChatHistoryFile>
    set: (history: ChatHistoryFile) => Promise<void>
  }
}
