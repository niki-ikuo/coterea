import { AUTOSAVE_MS, type PeerInfo } from '../../../shared/types'
import { earlierPeer, fileIdsOf, idsOverlap, offerKeys, type FileOffer } from '../../../shared/fileSession'
import {
  applyAwarenessBytes,
  applyYjs,
  clearRemoteAwareness,
  encodeAwarenessAll,
  encodeDoc,
  getText,
  retargetTabDoc,
  stashSync
} from './docs'
import { useAppStore, type TabInfo } from '../store'

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const remoteManifests = new Map<string, { peerId: string; startedAt: number; files: FileOffer[] }>()
const lastSyncKey = new Map<string, string>()
let syncGen = 0

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

function sendBytes(type: string, docId: string, bytes: Uint8Array): void {
  if (bytes.byteLength === 0) return
  window.coterea.collab.send(
    { type, docId },
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  )
}

export function sendFullState(docId: string): void {
  sendBytes('yjs-sync', docId, encodeDoc(docId))
  sendBytes('awareness', docId, encodeAwarenessAll(docId))
}

function bumpSyncGeneration(): void {
  syncGen += 1
  lastSyncKey.clear()
}

function mergePeerPresence(incoming: PeerInfo[]): PeerInfo[] {
  if (!isCollabActive()) {
    return incoming.map((peer) => ({ ...peer, docId: null, docTitle: null }))
  }
  const prev = useAppStore.getState().collab.peers
  const live = new Set(incoming.map((peer) => peer.id))
  return incoming.map((peer) => {
    const old = prev.find((item) => item.id === peer.id)
    return {
      ...peer,
      docId: peer.docId ?? old?.docId ?? null,
      docTitle: peer.docTitle ?? old?.docTitle ?? null
    }
  }).filter((peer) => live.has(peer.id))
}

export function editorsOnActiveFile(): PeerInfo[] {
  const { collab, activeTabId, displayName } = useAppStore.getState()
  const me: PeerInfo = {
    id: collab.localPeerId ?? 'local',
    displayName: displayName || '自分',
    color: collab.localColor,
    docId: activeTabId,
    docTitle: null
  }
  if (!isCollabActive() || !activeTabId) return [me]
  const remotes = collab.peers.filter(
    (peer) => peer.id !== collab.localPeerId && peer.docId === activeTabId
  )
  return [me, ...remotes]
}

export function sendPresence(): void {
  if (!isCollabActive()) return
  const { activeTabId, tabs, collab } = useAppStore.getState()
  const tab = tabs.find((t) => t.id === activeTabId)
  window.coterea.collab.send({
    type: 'presence',
    docId: tab?.id ?? null,
    docTitle: tab?.title ?? null
  })
  if (collab.localPeerId) {
    useAppStore.getState().patchCollab({
      peers: collab.peers.map((peer) =>
        peer.id === collab.localPeerId
          ? { ...peer, docId: tab?.id ?? null, docTitle: tab?.title ?? null }
          : peer
      )
    })
  }
}

function adoptCanonical(tab: TabInfo, canonicalId: string): TabInfo {
  if (tab.id === canonicalId) return tab
  const oldId = tab.id
  retargetTabDoc(oldId, canonicalId)
  useAppStore.getState().setTabs((tabs) =>
    tabs.map((t) => (t.id === oldId ? { ...t, id: canonicalId } : t))
  )
  if (useAppStore.getState().activeTabId === oldId) {
    useAppStore.getState().setActiveTabId(canonicalId)
  }
  markDirty(canonicalId)
  return { ...tab, id: canonicalId }
}

function exchangeDoc(tab: TabInfo, keys: string[], isOriginator: boolean): void {
  if (isOriginator) {
    window.coterea.collab.send({ type: 'file-canonical', keys, docId: tab.id })
  }
  sendFullState(tab.id)
}

function identityHint(
  connected: boolean,
  shared: string[],
  localTitles: string[],
  remoteTitles: string[]
): { identityHint: string | null; remoteFileTitles: string[] } {
  const remotes = [...new Set(remoteTitles)]
  if (!connected) return { identityHint: null, remoteFileTitles: remotes }
  if (shared.length > 0) return { identityHint: null, remoteFileTitles: remotes }
  if (localTitles.length === 0 && remotes.length === 0) {
    return { identityHint: null, remoteFileTitles: remotes }
  }
  if (localTitles.length > 0 && remotes.length === 0) {
    return {
      identityHint:
        '相手は共有できるファイルを開いていません。無題バッファは同期しません。同じ実体のファイルを双方で開いてください。',
      remoteFileTitles: remotes
    }
  }
  if (localTitles.length === 0 && remotes.length > 0) {
    return {
      identityHint: `相手は「${remotes.join('、')}」を開いていますが、こちらに同じ実体がありません。`,
      remoteFileTitles: remotes
    }
  }
  return {
    identityHint:
      '接続はできていますが、開いているファイルは同一実体ではありません。別PCのローカルコピー（同名でも C:\\… 同士など）は同期しません。ネットワーク共有上の同じファイルを双方で開いてください。',
    remoteFileTitles: remotes
  }
}

function reconcileFileSessions(): void {
  const { collab, tabs } = useAppStore.getState()
  const connected = isCollabActive()
  if (!connected) {
    useAppStore.getState().patchCollab({
      sharedKeys: [],
      remoteFileTitles: [],
      identityHint: null
    })
    return
  }
  const me = { peerId: collab.localPeerId ?? '', startedAt: collab.startedAt ?? Date.now() }
  const shared: string[] = []
  const localTitles: string[] = []

  for (const raw of tabs) {
    let tab = raw
    const keys = fileIdsOf(tab)
    if (keys.length === 0) continue
    localTitles.push(tab.title)
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
    if (originator.peerId !== me.peerId && originator.docId && originator.docId !== tab.id) {
      tab = adoptCanonical(tab, originator.docId)
    }
    const remoteSig = remotes
      .map((r) => `${r.peerId}:${r.docId}`)
      .sort()
      .join(',')
    const syncKey = `${syncGen}|${keys.slice().sort().join('|')}|${tab.id}|${remoteSig}`
    if (lastSyncKey.get(tab.id) !== syncKey) {
      lastSyncKey.set(tab.id, syncKey)
      exchangeDoc(tab, keys, originator.peerId === me.peerId)
    }
  }

  const remoteTitles = [...remoteManifests.values()].flatMap((m) => m.files.map((f) => f.title))
  useAppStore.getState().patchCollab({
    sharedKeys: [...new Set(shared)],
    ...identityHint(connected, shared, localTitles, remoteTitles)
  })
}

export function handleCollabFrame(msg: Record<string, unknown>, binary: ArrayBuffer): void {
  const type = String(msg.type ?? '')
  const docId = typeof msg.docId === 'string' ? msg.docId : null
  if (type === 'yjs' && docId) {
    applyYjs(docId, toUint8(binary))
    markDirty(docId)
  } else if (type === 'yjs-sync' && docId) {
    stashSync(docId, toUint8(binary))
    markDirty(docId)
  } else if (type === 'yjs-sync-request' && docId) {
    sendFullState(docId)
  } else if (type === 'awareness' && docId) {
    applyAwarenessBytes(docId, toUint8(binary))
  } else if (type === 'peer-joined' || type === 'became-host' || type === 'became-guest') {
    bumpSyncGeneration()
    publishManifest()
    sendPresence()
  } else if (type === 'host-lost' || type === 'became-solo') {
    remoteManifests.clear()
    bumpSyncGeneration()
    clearRemoteAwareness()
    const { collab } = useAppStore.getState()
    useAppStore.getState().patchCollab({
      sharedKeys: [],
      remoteFileTitles: [],
      identityHint: null,
      peers: collab.peers
        .filter((peer) => peer.id === collab.localPeerId)
        .map((peer) => ({ ...peer, docId: null, docTitle: null }))
    })
  } else if (type === 'peer-left') {
    const left = typeof msg.peerId === 'string' ? msg.peerId : null
    if (left) remoteManifests.delete(left)
    clearRemoteAwareness()
    if (left) {
      useAppStore.getState().patchCollab({
        peers: useAppStore.getState().collab.peers.filter((peer) => peer.id !== left)
      })
    }
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
    if (tab && tab.id !== docId) {
      const adopted = adoptCanonical(tab, docId)
      sendFullState(adopted.id)
    }
  } else if (type === 'peer-list' && Array.isArray(msg.peers)) {
    useAppStore.getState().patchCollab({ peers: mergePeerPresence(msg.peers as PeerInfo[]) })
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

function connectionHint(
  status: string,
  udpPeerCount: number,
  tcpPeerCount: number,
  connectError: string | null,
  netHint: string | null
): string | null {
  if (connectError) return connectError
  if (netHint) return netHint
  if (status === 'connecting') return '相手のハブへ TCP で接続しています…'
  if (status === 'solo' && udpPeerCount > 0) {
    return 'LAN上の相手を検出しました。接続を準備しています…'
  }
  if (status === 'hosting' && tcpPeerCount === 0 && udpPeerCount > 0) {
    return 'ハブとして待機中です。相手の参加を待っています…'
  }
  return null
}

export function attachCollabListeners(): () => void {
  const offFrame = window.coterea.collab.onFrame(({ msg, binary }) => {
    handleCollabFrame(msg, binary)
  })
  const offState = window.coterea.collab.onState((payload) => {
    const connectError = payload.connectError ?? null
    const udpPeerCount = payload.udpPeerCount ?? 0
    const tcpPeerCount = payload.tcpPeerCount ?? 0
    useAppStore.getState().patchCollab({
      status: payload.status,
      role: payload.role,
      localPeerId: payload.localPeerId,
      localColor: payload.localColor,
      error: connectError,
      udpPeerCount,
      tcpPeerCount,
      netHint: connectionHint(
        payload.status,
        udpPeerCount,
        tcpPeerCount,
        connectError,
        payload.netHint ?? null
      ),
      ...(typeof payload.startedAt === 'number' ? { startedAt: payload.startedAt } : {}),
      ...(payload.peers ? { peers: mergePeerPresence(payload.peers) } : {})
    })
    if (payload.status === 'hosting' || payload.status === 'joined') {
      reconcileFileSessions()
    }
  })
  const offPeers = window.coterea.collab.onPeers(({ peers }) => {
    const local = useAppStore.getState().collab.localPeerId
    const mine = peers.find((p) => p.id === local)
    useAppStore.getState().patchCollab({
      peers: mergePeerPresence(peers),
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

export { getTabDoc } from './docs'
