import { create } from 'zustand'
import type { CollabStatus, PeerInfo } from '../../shared/types'
import type { EncodingId } from '../../shared/encoding'

export type TabInfo = {
  id: string
  path: string | null
  hostPath: string | null
  title: string
  language: string
  isDirty: boolean
  encoding: EncodingId
}

export type CollabState = {
  status: CollabStatus
  roomId: string | null
  sessionName: string | null
  role: 'host' | 'guest' | null
  localPeerId: string | null
  localColor: string
  peers: PeerInfo[]
  error: string | null
}

type AppState = {
  tabs: TabInfo[]
  activeTabId: string | null
  displayName: string
  rightCollapsed: boolean
  line: number
  column: number
  joinOpen: boolean
  settingsOpen: boolean
  collab: CollabState
  setDisplayName: (name: string) => void
  setTabs: (tabs: TabInfo[] | ((prev: TabInfo[]) => TabInfo[])) => void
  setActiveTabId: (id: string | null) => void
  setCursor: (line: number, column: number) => void
  setRightCollapsed: (v: boolean) => void
  setJoinOpen: (v: boolean) => void
  setSettingsOpen: (v: boolean) => void
  patchCollab: (patch: Partial<CollabState>) => void
}

const idleCollab: CollabState = {
  status: 'idle',
  roomId: null,
  sessionName: null,
  role: null,
  localPeerId: null,
  localColor: '#E06C75',
  peers: [],
  error: null
}

export const useAppStore = create<AppState>((set) => ({
  tabs: [],
  activeTabId: null,
  displayName: '',
  rightCollapsed: false,
  line: 1,
  column: 1,
  joinOpen: false,
  settingsOpen: false,
  collab: idleCollab,
  setDisplayName: (displayName) => set({ displayName }),
  setTabs: (tabs) =>
    set((s) => ({ tabs: typeof tabs === 'function' ? tabs(s.tabs) : tabs })),
  setActiveTabId: (activeTabId) => set({ activeTabId }),
  setCursor: (line, column) => set({ line, column }),
  setRightCollapsed: (rightCollapsed) => set({ rightCollapsed }),
  setJoinOpen: (joinOpen) => set({ joinOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  patchCollab: (patch) => set((s) => ({ collab: { ...s.collab, ...patch } }))
}))

export function resetCollab(): void {
  useAppStore.getState().patchCollab(idleCollab)
}
