import { create } from 'zustand'
import type { CollabStatus, PeerInfo } from '../../shared/types'
import type { EncodingId } from '../../shared/encoding'
import { DEFAULT_THEME, type ThemeId } from '../../shared/theme'
import { defaultChatHistory, type ChatHistoryFile, type ChatMode } from '../../shared/ai'
import { emptyLlmUsage, type LlmUsageStats } from '../../shared/llmUsage'

export type MdView = 'edit' | 'split' | 'preview'

export type TabKind = 'file' | 'settings'

export type TabInfo = {
  id: string
  kind: TabKind
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
  saveError: string | null
}

export function isSettingsTab(tab: Pick<TabInfo, 'kind'>): boolean {
  return tab.kind === 'settings'
}

export function isVirtualTab(tab: Pick<TabInfo, 'kind'>): boolean {
  return tab.kind === 'settings'
}

export function isFileTab(tab: Pick<TabInfo, 'kind'>): boolean {
  return tab.kind === 'file'
}

export type CollabState = {
  status: CollabStatus
  role: 'solo' | 'host' | 'guest'
  localPeerId: string | null
  localColor: string
  startedAt: number | null
  peers: PeerInfo[]
  sharedKeys: string[]
  fileSavers: { title: string; local: boolean; name: string }[]
  remoteFileTitles: string[]
  identityHint: string | null
  error: string | null
  netHint: string | null
  udpPeerCount: number
  tcpPeerCount: number
  tcpPort: number
  listenAddresses: string[]
  holdHost: boolean
}

type AppState = {
  tabs: TabInfo[]
  activeTabId: string | null
  displayName: string
  theme: ThemeId
  collabPaneVisible: boolean
  minimapEnabled: boolean
  mdOutlineEnabled: boolean
  chatMode: ChatMode
  line: number
  column: number
  joinOpen: boolean
  collab: CollabState
  chat: ChatHistoryFile
  chatBusy: boolean
  chatRequestId: string | null
  aiConfigured: boolean
  aiHasKey: boolean
  aiUsage: LlmUsageStats
  setDisplayName: (name: string) => void
  setTheme: (theme: ThemeId) => void
  setTabs: (tabs: TabInfo[] | ((prev: TabInfo[]) => TabInfo[])) => void
  setActiveTabId: (id: string | null) => void
  setCursor: (line: number, column: number) => void
  setCollabPaneVisible: (v: boolean) => void
  setMinimapEnabled: (v: boolean) => void
  setMdOutlineEnabled: (v: boolean) => void
  setChatMode: (mode: ChatMode) => void
  setJoinOpen: (v: boolean) => void
  patchCollab: (patch: Partial<CollabState>) => void
  setChat: (chat: ChatHistoryFile | ((prev: ChatHistoryFile) => ChatHistoryFile)) => void
  setChatBusy: (busy: boolean, requestId?: string | null) => void
  setAiStatus: (status: { configured: boolean; hasKey: boolean }) => void
  setAiUsage: (usage: LlmUsageStats) => void
}

const idleCollab: CollabState = {
  status: 'solo',
  role: 'solo',
  localPeerId: null,
  localColor: '#E06C75',
  startedAt: null,
  peers: [],
  sharedKeys: [],
  fileSavers: [],
  remoteFileTitles: [],
  identityHint: null,
  error: null,
  netHint: null,
  udpPeerCount: 0,
  tcpPeerCount: 0,
  tcpPort: 0,
  listenAddresses: [],
  holdHost: false
}

export const useAppStore = create<AppState>((set) => ({
  tabs: [],
  activeTabId: null,
  displayName: '',
  theme: DEFAULT_THEME,
  collabPaneVisible: false,
  minimapEnabled: false,
  mdOutlineEnabled: true,
  chatMode: 'ask',
  line: 1,
  column: 1,
  joinOpen: false,
  collab: idleCollab,
  chat: defaultChatHistory(),
  chatBusy: false,
  chatRequestId: null,
  aiConfigured: false,
  aiHasKey: false,
  aiUsage: emptyLlmUsage(),
  setDisplayName: (displayName) => set({ displayName }),
  setTheme: (theme) => set({ theme }),
  setTabs: (tabs) =>
    set((s) => ({ tabs: typeof tabs === 'function' ? tabs(s.tabs) : tabs })),
  setActiveTabId: (activeTabId) => set({ activeTabId }),
  setCursor: (line, column) => set({ line, column }),
  setCollabPaneVisible: (collabPaneVisible) => set({ collabPaneVisible }),
  setMinimapEnabled: (minimapEnabled) => set({ minimapEnabled }),
  setMdOutlineEnabled: (mdOutlineEnabled) => set({ mdOutlineEnabled }),
  setChatMode: (chatMode) => set({ chatMode }),
  setJoinOpen: (joinOpen) => set({ joinOpen }),
  patchCollab: (patch) => set((s) => ({ collab: { ...s.collab, ...patch } })),
  setChat: (chat) => set((s) => ({ chat: typeof chat === 'function' ? chat(s.chat) : chat })),
  setChatBusy: (chatBusy, requestId) =>
    set({
      chatBusy,
      ...(requestId !== undefined ? { chatRequestId: requestId } : !chatBusy ? { chatRequestId: null } : {})
    }),
  setAiStatus: (status) => set({ aiConfigured: status.configured, aiHasKey: status.hasKey }),
  setAiUsage: (aiUsage) => set({ aiUsage })
}))

export function resetCollab(): void {
  useAppStore.getState().patchCollab(idleCollab)
}
