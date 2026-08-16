import { create } from 'zustand'
import type { CollabStatus, PeerInfo } from '../../shared/types'
import type { EncodingId } from '../../shared/encoding'
import { DEFAULT_THEME, type ThemeId } from '../../shared/theme'

export type MdView = 'edit' | 'split' | 'preview'

export type TabInfo = {
  id: string
  path: string | null
  hostPath: string | null
  title: string
  language: string
  isDirty: boolean
  encoding: EncodingId
  fileIds: string[]
  mdView: MdView
  mdSplitPct: number
  mdScrollSync: boolean
}

export type CollabState = {
  status: CollabStatus
  role: 'solo' | 'host' | 'guest'
  localPeerId: string | null
  localColor: string
  startedAt: number | null
  peers: PeerInfo[]
  sharedKeys: string[]
  remoteFileTitles: string[]
  identityHint: string | null
  error: string | null
  netHint: string | null
  udpPeerCount: number
  tcpPeerCount: number
}

type AppState = {
  tabs: TabInfo[]
  activeTabId: string | null
  displayName: string
  theme: ThemeId
  collabPaneVisible: boolean
  line: number
  column: number
  joinOpen: boolean
  collab: CollabState
  setDisplayName: (name: string) => void
  setTheme: (theme: ThemeId) => void
  setTabs: (tabs: TabInfo[] | ((prev: TabInfo[]) => TabInfo[])) => void
  setActiveTabId: (id: string | null) => void
  setCursor: (line: number, column: number) => void
  setCollabPaneVisible: (v: boolean) => void
  setJoinOpen: (v: boolean) => void
  patchCollab: (patch: Partial<CollabState>) => void
}

const idleCollab: CollabState = {
  status: 'solo',
  role: 'solo',
  localPeerId: null,
  localColor: '#E06C75',
  startedAt: null,
  peers: [],
  sharedKeys: [],
  remoteFileTitles: [],
  identityHint: null,
  error: null,
  netHint: null,
  udpPeerCount: 0,
  tcpPeerCount: 0
}

export const useAppStore = create<AppState>((set) => ({
  tabs: [],
  activeTabId: null,
  displayName: '',
  theme: DEFAULT_THEME,
  collabPaneVisible: false,
  line: 1,
  column: 1,
  joinOpen: false,
  collab: idleCollab,
  setDisplayName: (displayName) => set({ displayName }),
  setTheme: (theme) => set({ theme }),
  setTabs: (tabs) =>
    set((s) => ({ tabs: typeof tabs === 'function' ? tabs(s.tabs) : tabs })),
  setActiveTabId: (activeTabId) => set({ activeTabId }),
  setCursor: (line, column) => set({ line, column }),
  setCollabPaneVisible: (collabPaneVisible) => set({ collabPaneVisible }),
  setJoinOpen: (joinOpen) => set({ joinOpen }),
  patchCollab: (patch) => set((s) => ({ collab: { ...s.collab, ...patch } }))
}))

export function resetCollab(): void {
  useAppStore.getState().patchCollab(idleCollab)
}
