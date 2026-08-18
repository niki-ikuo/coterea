import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import * as Y from 'yjs'
import { MonacoBinding } from 'y-monaco'
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
import {
  AwarenessPeerIndex,
  clientIdsToDropForPeer,
  collectAwarenessClientIds,
  type AwarenessUser
} from '../../../shared/awarenessPeers'
import {
  applyRemoteYjs,
  createYTextDoc,
  encodeYDoc,
  replaceYDocFromSnapshot,
  YJS_LOAD_ORIGIN,
  YJS_TEXT_KEY
} from '../../../shared/yjsCanonical'
import { languageFromPath } from './fileMeta'

export type TabDoc = {
  id: string
  ydoc: Y.Doc
  ytext: Y.Text
  awareness: Awareness
  undo: Y.UndoManager
  model: monaco.editor.ITextModel
  binding: MonacoBinding | null
  editors: Set<monaco.editor.IStandaloneCodeEditor>
}

const docs = new Map<string, TabDoc>()
const pendingSync = new Map<string, Uint8Array>()
const pendingAwareness = new Map<string, Uint8Array>()
const awarenessIndex = new Map<string, AwarenessPeerIndex>()

type LocalUser = { name: string; color: string; peerId?: string }

function indexOf(id: string): AwarenessPeerIndex {
  let index = awarenessIndex.get(id)
  if (!index) {
    index = new AwarenessPeerIndex()
    awarenessIndex.set(id, index)
  }
  return index
}

function createUndoManager(ytext: Y.Text): Y.UndoManager {
  return new Y.UndoManager(ytext, { trackedOrigins: new Set() })
}

function resetBinding(tab: TabDoc, editors: Set<monaco.editor.IStandaloneCodeEditor> | null): void {
  if (tab.binding) {
    tab.undo.removeTrackedOrigin(tab.binding)
    tab.binding.destroy()
    tab.binding = null
  }
  if (!editors || editors.size === 0) return
  tab.binding = new MonacoBinding(tab.ytext, tab.model, editors, tab.awareness)
  tab.undo.addTrackedOrigin(tab.binding)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function sendYjs(docId: string, update: Uint8Array): void {
  window.coterea.collab.send({ type: 'yjs', docId }, toArrayBuffer(update))
}

function sendAwareness(docId: string, update: Uint8Array): void {
  window.coterea.collab.send({ type: 'awareness', docId }, toArrayBuffer(update))
}

function refreshRemoteCursorStyles(awareness: Awareness): void {
  const styleId = 'coterea-y-cursors'
  let el = document.getElementById(styleId) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = styleId
    document.head.appendChild(el)
  }
  const rules: string[] = []
  awareness.getStates().forEach((state, clientId) => {
    const user = state.user as { color?: string } | undefined
    const color = user?.color ?? '#e7c9a5'
    rules.push(`
      .yRemoteSelection-${clientId} { background-color: ${color}59; }
      .yRemoteSelectionHead-${clientId} {
        border-color: ${color};
        border-left-color: ${color};
      }
      .yRemoteSelectionHead-${clientId}::after { border-color: ${color}; }
    `)
  })
  el.textContent = rules.join('\n')
}

export function createTabDoc(
  id: string,
  content: string,
  language: string,
  user: LocalUser
): TabDoc {
  const existing = docs.get(id)
  if (existing) return existing

  const queued = pendingSync.get(id)
  pendingSync.delete(id)
  const ydoc = queued ? replaceYDocFromSnapshot(queued) : createYTextDoc(content)
  const ytext = ydoc.getText(YJS_TEXT_KEY)
  const awareness = new Awareness(ydoc)
  awareness.setLocalStateField('user', {
    name: user.name,
    color: user.color,
    ...(user.peerId ? { peerId: user.peerId } : {})
  })
  const undo = createUndoManager(ytext)
  const uri = monaco.Uri.parse(`coterea://tab/${id}`)
  const model = monaco.editor.createModel(ytext.toString(), language, uri)

  const tab: TabDoc = { id, ydoc, ytext, awareness, undo, model, binding: null, editors: new Set() }
  docs.set(id, tab)
  attachDocEvents(tab)
  flushPendingAwareness(tab)
  return tab
}

function attachDocEvents(tab: TabDoc): void {
  tab.ydoc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote') return
    sendYjs(tab.id, update)
  })
  tab.awareness.on('update', (_change: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    refreshRemoteCursorStyles(tab.awareness)
    if (origin === 'remote' || origin === 'peer-left') return
    sendAwareness(tab.id, encodeAwarenessUpdate(tab.awareness, [tab.awareness.clientID]))
  })
}

function flushPendingAwareness(tab: TabDoc): void {
  const queuedAw = pendingAwareness.get(tab.id)
  pendingAwareness.delete(tab.id)
  if (queuedAw) applyAwarenessUpdate(tab.awareness, queuedAw, 'remote')
}

function localUserOf(tab: TabDoc): LocalUser {
  const user = tab.awareness.getLocalState()?.user as AwarenessUser | undefined
  return {
    name: user?.name ?? '自分',
    color: user?.color ?? '#e7c9a5',
    peerId: user?.peerId
  }
}

function announceLocalAwarenessGone(tab: TabDoc): void {
  try {
    tab.awareness.setLocalState(null)
  } catch {
    /* already destroyed */
  }
}

/** 正本のスナップショットで Y.Doc を置き換える。独立初期化した文書同士のマージはしない。 */
export function applyFullSync(id: string, update: Uint8Array): void {
  const tab = docs.get(id)
  if (!tab) {
    pendingSync.set(id, update)
    return
  }
  const user = localUserOf(tab)
  const editors = [...tab.editors]
  const remoteIds = [...tab.awareness.getStates().keys()].filter((id) => id !== tab.awareness.clientID)
  const remoteAw = remoteIds.length > 0 ? encodeAwarenessUpdate(tab.awareness, remoteIds) : null
  resetBinding(tab, null)
  announceLocalAwarenessGone(tab)
  tab.awareness.destroy()
  tab.ydoc.destroy()
  awarenessIndex.delete(id)

  const ydoc = replaceYDocFromSnapshot(update)
  const ytext = ydoc.getText(YJS_TEXT_KEY)
  const awareness = new Awareness(ydoc)
  const undo = createUndoManager(ytext)
  tab.ydoc = ydoc
  tab.ytext = ytext
  tab.awareness = awareness
  tab.undo = undo
  attachDocEvents(tab)
  if (remoteAw) applyAwarenessUpdate(awareness, remoteAw, 'remote')
  awareness.setLocalStateField('user', user)
  const next = ytext.toString()
  if (tab.model.getValue() !== next) tab.model.setValue(next)
  if (editors.length > 0) {
    resetBinding(tab, new Set(editors))
  }
  flushPendingAwareness(tab)
}

function flushPending(tab: TabDoc): void {
  const queued = pendingSync.get(tab.id)
  pendingSync.delete(tab.id)
  if (queued) applyFullSync(tab.id, queued)
  else flushPendingAwareness(tab)
}

/** 正本 ID に付け替える。正本の Y.Doc が既にあればそちらを残し、二重の全文は混ぜない。 */
export function retargetTabDoc(oldId: string, newId: string): void {
  if (oldId === newId) return
  const old = docs.get(oldId)
  if (!old) return
  const existing = docs.get(newId)
  if (!existing) {
    docs.delete(oldId)
    old.id = newId
    docs.set(newId, old)
    const index = awarenessIndex.get(oldId)
    if (index) {
      awarenessIndex.delete(oldId)
      awarenessIndex.set(newId, index)
    }
    flushPending(old)
    return
  }
  disposeTabDoc(oldId)
  flushPending(existing)
}

export function getTabDoc(id: string): TabDoc | undefined {
  return docs.get(id)
}

export function bindEditor(id: string, editor: monaco.editor.IStandaloneCodeEditor): void {
  const tab = docs.get(id)
  if (!tab) return
  tab.editors.add(editor)
  resetBinding(tab, tab.editors)
}

export function unbindEditor(id: string): void {
  const tab = docs.get(id)
  if (!tab) return
  resetBinding(tab, null)
  tab.editors.clear()
}

export function setLanguage(id: string, language: string): void {
  const tab = docs.get(id)
  if (!tab) return
  monaco.editor.setModelLanguage(tab.model, language)
}

export function getText(id: string): string {
  return docs.get(id)?.ytext.toString() ?? ''
}

export function replaceText(id: string, content: string): void {
  const tab = docs.get(id)
  if (!tab) return
  tab.ydoc.transact(() => {
    const len = tab.ytext.length
    if (len > 0) tab.ytext.delete(0, len)
    if (content) tab.ytext.insert(0, content)
  }, YJS_LOAD_ORIGIN)
}

export function encodeDoc(id: string): Uint8Array {
  const tab = docs.get(id)
  if (!tab) return new Uint8Array()
  return encodeYDoc(tab.ydoc)
}

export function encodeAwarenessLocal(id: string): Uint8Array {
  const tab = docs.get(id)
  if (!tab) return new Uint8Array()
  return encodeAwarenessUpdate(tab.awareness, [tab.awareness.clientID])
}

type ViewportAnchor = {
  editor: monaco.editor.IStandaloneCodeEditor
  model: monaco.editor.ITextModel
  ids: string[]
  offset: number
}

function withPreservedViewports(editors: Iterable<monaco.editor.IStandaloneCodeEditor>, apply: () => void): void {
  const anchors: ViewportAnchor[] = []
  for (const editor of editors) {
    const model = editor.getModel()
    const visible = editor.getVisibleRanges()[0]
    if (!model || !visible) continue
    const line = visible.startLineNumber
    anchors.push({
      editor,
      model,
      offset: editor.getScrollTop() - editor.getTopForLineNumber(line),
      ids: model.deltaDecorations([], [{
        range: new monaco.Range(line, 1, line, 1),
        options: { stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }
      }])
    })
  }
  try {
    apply()
  } finally {
    for (const snap of anchors) {
      const range = snap.model.getDecorationRange(snap.ids[0])
      snap.model.deltaDecorations(snap.ids, [])
      if (!range) continue
      const nextTop = snap.editor.getTopForLineNumber(range.startLineNumber) + snap.offset
      if (Math.abs(nextTop - snap.editor.getScrollTop()) < 0.5) continue
      snap.editor.setScrollTop(nextTop, monaco.editor.ScrollType.Immediate)
    }
  }
}

export function applyYjs(id: string, update: Uint8Array): void {
  const tab = docs.get(id)
  if (!tab) return
  withPreservedViewports(tab.editors, () => {
    applyRemoteYjs(tab.ydoc, update)
  })
}

/** 未オープンの正本へ届いた全文スナップショットだけ保持する。増分は捨てる。 */
export function stashSync(id: string, update: Uint8Array): void {
  applyFullSync(id, update)
}

export function applyAwarenessBytes(id: string, update: Uint8Array, fromPeerId?: string): void {
  const tab = docs.get(id)
  if (!tab) {
    pendingAwareness.set(id, update)
    return
  }
  const previous = new Set(tab.awareness.getStates().keys())
  applyAwarenessUpdate(tab.awareness, update, 'remote')
  if (fromPeerId) {
    indexOf(id).note(
      fromPeerId,
      collectAwarenessClientIds(tab.awareness.getStates(), fromPeerId, previous, tab.awareness.clientID)
    )
  }
}

export function setLocalUser(user: LocalUser): void {
  for (const tab of docs.values()) {
    tab.awareness.setLocalStateField('user', user)
  }
}

export function clearRemoteAwareness(): void {
  for (const tab of docs.values()) {
    const gone = [...tab.awareness.getStates().keys()].filter((id) => id !== tab.awareness.clientID)
    if (gone.length > 0) removeAwarenessStates(tab.awareness, gone, 'peer-left')
    refreshRemoteCursorStyles(tab.awareness)
    awarenessIndex.get(tab.id)?.clear()
  }
}

export function clearRemoteAwarenessForPeer(peerId: string): void {
  if (!peerId) return
  for (const tab of docs.values()) {
    const gone = clientIdsToDropForPeer(
      tab.awareness.getStates(),
      peerId,
      tab.awareness.clientID,
      indexOf(tab.id).forgetPeer(peerId)
    )
    if (gone.length > 0) removeAwarenessStates(tab.awareness, gone, 'peer-left')
    refreshRemoteCursorStyles(tab.awareness)
  }
}

export function disposeTabDoc(id: string): void {
  const tab = docs.get(id)
  if (!tab) return
  resetBinding(tab, null)
  announceLocalAwarenessGone(tab)
  tab.awareness.destroy()
  tab.ydoc.destroy()
  tab.model.dispose()
  docs.delete(id)
  pendingSync.delete(id)
  pendingAwareness.delete(id)
  awarenessIndex.delete(id)
}

export function languageOf(path: string | null): string {
  return languageFromPath(path)
}
