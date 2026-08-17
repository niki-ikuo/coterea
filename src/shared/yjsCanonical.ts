import * as Y from 'yjs'

export const YJS_REMOTE_ORIGIN = 'remote'
export const YJS_LOAD_ORIGIN = 'load'
export const YJS_TEXT_KEY = 'monaco'

export function createYTextDoc(content: string, origin: string = YJS_LOAD_ORIGIN): Y.Doc {
  const ydoc = new Y.Doc()
  const ytext = ydoc.getText(YJS_TEXT_KEY)
  if (content) {
    ydoc.transact(() => {
      ytext.insert(0, content)
    }, origin)
  }
  return ydoc
}

export function yTextOf(doc: Y.Doc): string {
  return doc.getText(YJS_TEXT_KEY).toString()
}

export function encodeYDoc(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc)
}

export function applyRemoteYjs(doc: Y.Doc, update: Uint8Array): void {
  Y.applyUpdate(doc, update, YJS_REMOTE_ORIGIN)
}

/** 正本スナップショットで新しい Y.Doc を作る。独立に初期化した文書同士はマージしない。 */
export function replaceYDocFromSnapshot(snapshot: Uint8Array): Y.Doc {
  const ydoc = new Y.Doc()
  Y.applyUpdate(ydoc, snapshot, YJS_REMOTE_ORIGIN)
  return ydoc
}
