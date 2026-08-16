import * as monaco from 'monaco-editor'
import * as Y from 'yjs'
import { MonacoBinding } from 'y-monaco'
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
import { languageFromPath } from './monacoEnv'

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
  user: { name: string; color: string }
): TabDoc {
  const existing = docs.get(id)
  if (existing) return existing

  const ydoc = new Y.Doc()
  const ytext = ydoc.getText('monaco')
  const queued = pendingSync.get(id)
  if (queued) {
    pendingSync.delete(id)
    Y.applyUpdate(ydoc, queued, 'remote')
  } else if (content) {
    ytext.insert(0, content)
  }
  const awareness = new Awareness(ydoc)
  awareness.setLocalStateField('user', { name: user.name, color: user.color })
  const undo = new Y.UndoManager(ytext)
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
  tab.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    refreshRemoteCursorStyles(tab.awareness)
    if (origin === 'remote') return
    const changed = added.concat(updated, removed)
    sendAwareness(tab.id, encodeAwarenessUpdate(tab.awareness, changed))
  })
}

function flushPendingAwareness(tab: TabDoc): void {
  const queuedAw = pendingAwareness.get(tab.id)
  pendingAwareness.delete(tab.id)
  if (queuedAw) applyAwarenessUpdate(tab.awareness, queuedAw, 'remote')
}

function localUserOf(tab: TabDoc): { name: string; color: string } {
  const user = tab.awareness.getLocalState()?.user as { name?: string; color?: string } | undefined
  return { name: user?.name ?? '自分', color: user?.color ?? '#e7c9a5' }
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
  tab.binding?.destroy()
  tab.binding = null
  tab.awareness.destroy()
  tab.ydoc.destroy()

  const ydoc = new Y.Doc()
  Y.applyUpdate(ydoc, update, 'remote')
  const ytext = ydoc.getText('monaco')
  const awareness = new Awareness(ydoc)
  awareness.setLocalStateField('user', user)
  const undo = new Y.UndoManager(ytext)
  tab.ydoc = ydoc
  tab.ytext = ytext
  tab.awareness = awareness
  tab.undo = undo
  attachDocEvents(tab)
  const next = ytext.toString()
  if (tab.model.getValue() !== next) tab.model.setValue(next)
  if (editors.length > 0) {
    tab.binding = new MonacoBinding(ytext, tab.model, new Set(editors), awareness)
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
  tab.binding?.destroy()
  tab.binding = new MonacoBinding(tab.ytext, tab.model, tab.editors, tab.awareness)
}

export function unbindEditor(id: string): void {
  const tab = docs.get(id)
  if (!tab) return
  tab.binding?.destroy()
  tab.binding = null
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
  })
}

export function encodeDoc(id: string): Uint8Array {
  const tab = docs.get(id)
  if (!tab) return new Uint8Array()
  return Y.encodeStateAsUpdate(tab.ydoc)
}

export function encodeAwarenessAll(id: string): Uint8Array {
  const tab = docs.get(id)
  if (!tab) return new Uint8Array()
  const ids = [...tab.awareness.getStates().keys()]
  if (ids.length === 0) return new Uint8Array()
  return encodeAwarenessUpdate(tab.awareness, ids)
}

export function applyYjs(id: string, update: Uint8Array): void {
  const tab = docs.get(id)
  if (!tab) return
  Y.applyUpdate(tab.ydoc, update, 'remote')
}

/** 未オープンの正本へ届いた全文スナップショットだけ保持する。増分は捨てる。 */
export function stashSync(id: string, update: Uint8Array): void {
  applyFullSync(id, update)
}

export function applyAwarenessBytes(id: string, update: Uint8Array): void {
  const tab = docs.get(id)
  if (!tab) {
    pendingAwareness.set(id, update)
    return
  }
  applyAwarenessUpdate(tab.awareness, update, 'remote')
}

export function setLocalUser(user: { name: string; color: string }): void {
  for (const tab of docs.values()) {
    tab.awareness.setLocalStateField('user', user)
  }
}

export function clearRemoteAwareness(): void {
  for (const tab of docs.values()) {
    const gone = [...tab.awareness.getStates().keys()].filter((id) => id !== tab.awareness.clientID)
    if (gone.length > 0) removeAwarenessStates(tab.awareness, gone, 'local')
    refreshRemoteCursorStyles(tab.awareness)
  }
}

export function disposeTabDoc(id: string): void {
  const tab = docs.get(id)
  if (!tab) return
  tab.binding?.destroy()
  tab.awareness.destroy()
  tab.ydoc.destroy()
  tab.model.dispose()
  docs.delete(id)
  pendingSync.delete(id)
  pendingAwareness.delete(id)
}

export function languageOf(path: string | null): string {
  return languageFromPath(path)
}
