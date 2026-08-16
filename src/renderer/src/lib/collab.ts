import { AUTOSAVE_MS, type PeerInfo } from '../../../shared/types'
import {
  applyAwarenessBytes,
  applyYjs,
  createTabDoc,
  disposeTabDoc,
  encodeDoc,
  getTabDoc,
  getText,
  languageOf
} from './docs'
import { titleFromPath } from './monacoEnv'
import { resetCollab, useAppStore, type TabInfo } from '../store'
import { DEFAULT_ENCODING } from '../../../shared/encoding'

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

function toUint8(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data)
}

export function isCollabActive(): boolean {
  const { status } = useAppStore.getState().collab
  return status === 'hosting' || status === 'joined'
}

export function tabToMeta(tab: TabInfo) {
  return {
    id: tab.id,
    title: tab.title,
    hostPath: tab.path ?? tab.hostPath,
    language: tab.language
  }
}

export function publishDocs(): void {
  if (!isCollabActive()) return
  const { tabs, collab } = useAppStore.getState()
  if (collab.role !== 'host') return
  void window.coterea.collab.setDocs(tabs.map(tabToMeta))
}

export function scheduleAutosave(tabId: string): void {
  if (!isCollabActive()) return
  const tab = useAppStore.getState().tabs.find((t) => t.id === tabId)
  if (!tab?.path) return
  const prev = saveTimers.get(tabId)
  if (prev) clearTimeout(prev)
  saveTimers.set(
    tabId,
    setTimeout(() => {
      void window.coterea.fs.write(tab.path!, getText(tabId), tab.encoding)
      useAppStore.getState().setTabs((tabs) => tabs.map((t) => (t.id === tabId ? { ...t, isDirty: false } : t)))
    }, AUTOSAVE_MS)
  )
}

export function markDirty(tabId: string): void {
  useAppStore.getState().setTabs((tabs) =>
    tabs.map((t) => (t.id === tabId && !t.isDirty ? { ...t, isDirty: true } : t))
  )
  scheduleAutosave(tabId)
}

export function sendFullState(docId: string): void {
  const bytes = encodeDoc(docId)
  window.coterea.collab.send({ type: 'yjs-sync', docId }, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
}

export function sendPresence(): void {
  if (!isCollabActive()) return
  const { activeTabId, tabs } = useAppStore.getState()
  const tab = tabs.find((t) => t.id === activeTabId)
  window.coterea.collab.send({
    type: 'presence',
    docId: tab?.id ?? null,
    docTitle: tab?.title ?? null
  })
}

function addRemoteTab(meta: { id: string; title: string; hostPath: string | null; language?: string }): void {
  const { tabs, displayName, collab } = useAppStore.getState()
  if (tabs.some((t) => t.id === meta.id)) return
  const language = meta.language || languageOf(meta.hostPath)
  createTabDoc(meta.id, '', language, { name: displayName, color: collab.localColor })
  const tab: TabInfo = {
    id: meta.id,
    path: null,
    hostPath: meta.hostPath,
    title: meta.title || titleFromPath(meta.hostPath),
    language,
    isDirty: false,
    encoding: DEFAULT_ENCODING
  }
  useAppStore.getState().setTabs((prev) => [...prev, tab])
  if (!useAppStore.getState().activeTabId) {
    useAppStore.getState().setActiveTabId(tab.id)
  }
}

export function handleCollabFrame(msg: Record<string, unknown>, binary: ArrayBuffer): void {
  const type = String(msg.type ?? '')
  const docId = typeof msg.docId === 'string' ? msg.docId : null
  if (type === 'yjs' && docId) {
    applyYjs(docId, toUint8(binary))
    markDirty(docId)
  } else if (type === 'yjs-sync' && docId) {
    applyYjs(docId, toUint8(binary))
  } else if (type === 'awareness' && docId) {
    applyAwarenessBytes(docId, toUint8(binary))
  } else if (type === 'peer-joined') {
    const { tabs, collab } = useAppStore.getState()
    if (collab.role === 'host') {
      for (const tab of tabs) sendFullState(tab.id)
    }
  } else if (type === 'doc-open' && msg.doc && typeof msg.doc === 'object') {
    addRemoteTab(msg.doc as { id: string; title: string; hostPath: string | null; language?: string })
  } else if (type === 'docs' && Array.isArray(msg.docs)) {
    for (const doc of msg.docs) {
      addRemoteTab(doc as { id: string; title: string; hostPath: string | null; language?: string })
    }
  } else if (type === 'peer-list' && Array.isArray(msg.peers)) {
    useAppStore.getState().patchCollab({ peers: msg.peers as PeerInfo[] })
  } else if (type === 'presence') {
    const peerId = typeof msg.peerId === 'string' ? msg.peerId : null
    useAppStore.getState().patchCollab({
      peers: useAppStore.getState().collab.peers.map((p) =>
        peerId && p.id === peerId
          ? {
              ...p,
              docId: typeof msg.docId === 'string' ? msg.docId : null,
              docTitle: typeof msg.docTitle === 'string' ? msg.docTitle : null
            }
          : p
      )
    })
  }
}

export function attachCollabListeners(): () => void {
  const offFrame = window.coterea.collab.onFrame(({ msg, binary }) => {
    handleCollabFrame(msg, binary)
  })
  const offPeers = window.coterea.collab.onPeers(({ peers }) => {
    const local = useAppStore.getState().collab.localPeerId
    const mine = peers.find((p) => p.id === local)
    useAppStore.getState().patchCollab({
      peers,
      localColor: mine?.color ?? useAppStore.getState().collab.localColor
    })
  })
  const offEnded = window.coterea.collab.onEnded(({ reason }) => {
    useAppStore.getState().patchCollab({ status: 'error', error: reason })
    resetCollab()
    useAppStore.getState().patchCollab({ error: reason, status: 'idle' })
  })
  return () => {
    offFrame()
    offPeers()
    offEnded()
  }
}

export async function startCollab(): Promise<void> {
  const { displayName, tabs } = useAppStore.getState()
  const sessionName = `${displayName}のセッション`
  const result = await window.coterea.collab.start(displayName, sessionName)
  if (!result.ok) {
    useAppStore.getState().patchCollab({ status: 'error', error: result.error })
    return
  }
  useAppStore.getState().patchCollab({
    status: 'hosting',
    roomId: result.roomId,
    sessionName: result.sessionName,
    role: 'host',
    localPeerId: result.localPeerId,
    error: null
  })
  await window.coterea.collab.setDocs(tabs.map(tabToMeta))
  sendPresence()
}

export async function joinCollab(roomId: string): Promise<void> {
  const { displayName } = useAppStore.getState()
  useAppStore.getState().patchCollab({ status: 'connecting', error: null })
  const result = await window.coterea.collab.join(roomId, displayName)
  if (!result.ok) {
    useAppStore.getState().patchCollab({ status: 'error', error: result.error })
    return
  }
  useAppStore.getState().patchCollab({
    status: 'joined',
    roomId: result.roomId,
    sessionName: result.sessionName,
    role: 'guest',
    localPeerId: result.localPeerId,
    localColor: result.color,
    error: null
  })
  const leftovers = useAppStore.getState().tabs.filter((tab) => {
    const empty = tab.path === null && tab.title === '無題' && getText(tab.id) === ''
    if (empty) disposeTabDoc(tab.id)
    return !empty
  })
  useAppStore.getState().setTabs(leftovers)
  for (const doc of result.docs) {
    addRemoteTab(doc)
  }
  sendPresence()
}

export async function leaveCollab(): Promise<void> {
  await window.coterea.collab.leave()
  resetCollab()
}

export function announceNewDoc(tab: TabInfo): void {
  if (!isCollabActive()) return
  const { collab } = useAppStore.getState()
  if (collab.role === 'host') {
    window.coterea.collab.send({ type: 'doc-open', doc: tabToMeta(tab) })
    sendFullState(tab.id)
    publishDocs()
  }
}

export { getTabDoc }
