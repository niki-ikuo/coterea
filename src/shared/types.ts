export const COLLAB_UDP_PORT = 47821
export const COLLAB_MAGIC = 'COTEREA1'
export const AUTOSAVE_MS = 800
export const FILE_SIZE_WARN_BYTES = 2 * 1024 * 1024
export const FILE_LINE_WARN = 100_000

export const PEER_COLORS = [
  '#E06C75',
  '#61AFEF',
  '#98C379',
  '#E5C07B',
  '#C678DD',
  '#56B6C2',
  '#D19A66',
  '#ABB2BF'
]

export interface PeerInfo {
  id: string
  displayName: string
  color: string
  docId: string | null
  docTitle: string | null
}

export interface CollabSessionInfo {
  roomId: string
  sessionName: string
  role: 'host' | 'guest'
  peers: PeerInfo[]
  hostDisconnectedEndsSession: true
}

export interface DocMeta {
  id: string
  title: string
  hostPath: string | null
  language: string
}

export interface AppSettings {
  displayName: string
}

export interface OpenDialogResult {
  canceled: boolean
  paths: string[]
}

export interface ReadFileResult {
  path: string
  content: string
  bytes: number
  lines: number
  tooLarge: boolean
  encoding: import('./encoding').EncodingId
  detectedEncoding: import('./encoding').EncodingId
}

export interface SaveResult {
  canceled: boolean
  path: string | null
}

export type CollabStatus = 'idle' | 'hosting' | 'connecting' | 'joined' | 'error'

export type MainToRenderer =
  | { channel: 'collab:peer-update'; payload: { peers: PeerInfo[] } }
  | { channel: 'collab:frame'; payload: { msg: Record<string, unknown>; binary: ArrayBuffer } }
  | { channel: 'collab:ended'; payload: { reason: string } }
  | { channel: 'menu'; payload: { action: string } }
  | { channel: 'app:close-request'; payload: null }

export interface CollabStartResult {
  ok: true
  roomId: string
  sessionName: string
  localPeerId: string
}

export interface CollabJoinResult {
  ok: true
  roomId: string
  sessionName: string
  localPeerId: string
  docs: DocMeta[]
}

export type CollabFail = { ok: false; error: string }
