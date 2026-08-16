import { AUTOSAVE_MS, type PeerInfo } from '../../../shared/types'
import { earlierPeer, fileIdsOf, idsOverlap, offerKeys, type FileOffer } from '../../../shared/fileSession'
import {
  applyAwarenessBytes,
  applyYjs,
  createTabDoc,
  disposeTabDoc,
  encodeDoc,
  getTabDoc,
  getText
} from './docs'
import { useAppStore, type TabInfo } from '../store'

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const remoteManifests = new Map<string, { peerId: string; startedAt: number; files: FileOffer[] }>()
const sentCanonical = new Map<string, string>()

function toUint8(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data)
}

export function isCollabActive(): boolean {
  const { status } = useAppStore.getState().collab
  return status === 'hosting' || status === 'joined'
}

function localOffers(): FileOffer[] {
  return useAppStore
    .getState()
    .tabs.flatMap((tab) => {
      const keys = fileIdsOf(tab)
      if (keys.length === 0) return []
      return [{ docId: tab.id, keys, title: tab.title, language: tab.language }]
    })
}

export function publishManifest(): void {
  if (!isCollabActive()) return
  const { collab } = useAppStore.getState()
  window.coterea.collab.send({
    type: 'files-manifest',
    startedAt: collab.startedAt,
    files: localOffers()
  })
  reconcileFileSessions()
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
  window.coterea.collab.send(
    { type: 'yjs-sync', docId },
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  )
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

function adoptCanonical(tab: TabInfo, canonicalId: string): void {
  if (tab.id === canonicalId) return
  const { displayName, collab, activeTabId } = useAppStore.getState()
  const oldId = tab.id
  if (!getTabDoc(canonicalId)) {
    createTabDoc(canonicalId, '', tab.language, { name: displayName, color: collab.localColor })
  }
  useAppStore.getState().setTabs((tabs) =>
    tabs.map((t) => (t.id === oldId ? { ...t, id: canonicalId } : t))
  )
  if (activeTabId === oldId) useAppStore.getState().setActiveTabId(canonicalId)
  queueMicrotask(() => disposeTabDoc(oldId))
}

function reconcileFileSessions(): void {
  if (!isCollabActive()) {
    useAppStore.getState().patchCollab({ sharedKeys: [] })
    return
  }
  const { collab, tabs } = useAppStore.getState()
  const me = { peerId: collab.localPeerId ?? '', startedAt: collab.startedAt ?? Date.now() }
  const shared: string[] = []

  for (const tab of tabs) {
    const keys = fileIdsOf(tab)
    if (keys.length === 0) continue
    const remotes = [...remoteManifests.values()].flatMap((m) =>
      m.files
        .filter((f) => idsOverlap(offerKeys(f), keys))
        .map((f) => ({ ...f, peerId: m.peerId, startedAt: m.startedAt }))
    )
    if (remotes.length === 0) continue
    shared.push(tab.title)
    const originator = remotes.reduce(
      (best, cur) => (earlierPeer(cur, best) ? cur : best),
      { peerId: me.peerId, startedAt: me.startedAt, docId: tab.id, keys, title: tab.title, language: tab.language }
    )
    const sessionToken = keys.slice().sort().join('|')
    if (originator.peerId === me.peerId) {
      if (sentCanonical.get(sessionToken) !== tab.id) {
        sentCanonical.set(sessionToken, tab.id)
        window.coterea.collab.send({ type: 'file-canonical', keys, docId: tab.id })
        sendFullState(tab.id)
      }
    } else if (originator.docId && originator.docId !== tab.id) {
      adoptCanonical(tab, originator.docId)
    }
  }

  useAppStore.getState().patchCollab({ sharedKeys: [...new Set(shared)] })
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
  } else if (type === 'peer-joined' || type === 'became-host' || type === 'became-guest') {
    sentCanonical.clear()
    publishManifest()
    sendPresence()
  } else if (type === 'host-lost' || type === 'became-solo') {
    remoteManifests.clear()
    sentCanonical.clear()
    useAppStore.getState().patchCollab({ sharedKeys: [] })
  } else if (type === 'peer-left') {
    const left = typeof msg.peerId === 'string' ? msg.peerId : null
    if (left) remoteManifests.delete(left)
    reconcileFileSessions()
  } else if (type === 'files-manifest' && Array.isArray(msg.files)) {
    const peerId = typeof msg.peerId === 'string' ? msg.peerId : ''
    const startedAt = typeof msg.startedAt === 'number' ? msg.startedAt : Date.now()
    if (peerId) {
      remoteManifests.set(peerId, {
        peerId,
        startedAt,
        files: msg.files as FileOffer[]
      })
      reconcileFileSessions()
    }
  } else if (type === 'file-canonical' && docId) {
    const incoming =
      Array.isArray(msg.keys) && msg.keys.every((k) => typeof k === 'string')
        ? (msg.keys as string[])
        : typeof msg.key === 'string'
          ? [msg.key]
          : []
    const tab = useAppStore.getState().tabs.find((t) => idsOverlap(fileIdsOf(t), incoming))
    if (tab && tab.id !== docId) adoptCanonical(tab, docId)
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
  const offState = window.coterea.collab.onState((payload) => {
    useAppStore.getState().patchCollab({
      status: payload.status,
      role: payload.role,
      localPeerId: payload.localPeerId,
      localColor: payload.localColor,
      error: null,
      ...(typeof payload.startedAt === 'number' ? { startedAt: payload.startedAt } : {}),
      ...(payload.peers ? { peers: payload.peers } : {})
    })
  })
  const offPeers = window.coterea.collab.onPeers(({ peers }) => {
    const local = useAppStore.getState().collab.localPeerId
    const mine = peers.find((p) => p.id === local)
    useAppStore.getState().patchCollab({
      peers,
      localColor: mine?.color ?? useAppStore.getState().collab.localColor
    })
  })
  return () => {
    offFrame()
    offState()
    offPeers()
  }
}

export async function enableCollab(): Promise<void> {
  const { displayName } = useAppStore.getState()
  const result = await window.coterea.collab.enable(displayName)
  useAppStore.getState().patchCollab({ localPeerId: result.localPeerId, status: 'solo', role: 'solo' })
}

export function announceNewDoc(_tab: TabInfo): void {
  publishManifest()
}

export { getTabDoc }
