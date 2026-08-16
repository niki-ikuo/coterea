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
}

const docs = new Map<string, TabDoc>()
const pendingUpdates = new Map<string, Uint8Array[]>()
const pendingAwareness = new Map<string, Uint8Array[]>()

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
  if (content) ytext.insert(0, content)
  const awareness = new Awareness(ydoc)
  awareness.setLocalStateField('user', { name: user.name, color: user.color })
  const undo = new Y.UndoManager(ytext)
  const uri = monaco.Uri.parse(`coterea://tab/${id}`)
  const model = monaco.editor.createModel(ytext.toString(), language, uri)

  const tab: TabDoc = { id, ydoc, ytext, awareness, undo, model, binding: null }
  docs.set(id, tab)

  ydoc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote') return
    sendYjs(id, update)
  })
  awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    refreshRemoteCursorStyles(awareness)
    if (origin === 'remote') return
    const changed = added.concat(updated, removed)
    sendAwareness(id, encodeAwarenessUpdate(awareness, changed))
  })

  const queued = pendingUpdates.get(id) ?? []
  pendingUpdates.delete(id)
  for (const u of queued) Y.applyUpdate(ydoc, u, 'remote')
  const queuedAw = pendingAwareness.get(id) ?? []
  pendingAwareness.delete(id)
  for (const u of queuedAw) applyAwarenessUpdate(awareness, u, 'remote')

  return tab
}

export function getTabDoc(id: string): TabDoc | undefined {
  return docs.get(id)
}

export function bindEditor(id: string, editor: monaco.editor.IStandaloneCodeEditor): void {
  const tab = docs.get(id)
  if (!tab) return
  tab.binding?.destroy()
  tab.binding = new MonacoBinding(tab.ytext, tab.model, new Set([editor]), tab.awareness)
}

export function unbindEditor(id: string): void {
  const tab = docs.get(id)
  if (!tab) return
  tab.binding?.destroy()
  tab.binding = null
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

export function applyYjs(id: string, update: Uint8Array): void {
  const tab = docs.get(id)
  if (!tab) {
    const list = pendingUpdates.get(id) ?? []
    list.push(update)
    pendingUpdates.set(id, list)
    return
  }
  Y.applyUpdate(tab.ydoc, update, 'remote')
}

export function applyAwarenessBytes(id: string, update: Uint8Array): void {
  const tab = docs.get(id)
  if (!tab) {
    const list = pendingAwareness.get(id) ?? []
    list.push(update)
    pendingAwareness.set(id, list)
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
}

export function languageOf(path: string | null): string {
  return languageFromPath(path)
}
