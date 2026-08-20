/** 配列内の要素を from → to へ移動する（to は移動後のインデックス）。 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to) return [...items]
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items]
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * ドロップ先タブの左右どちら側かから、移動後インデックスを決める。
 * from と over が同じなら変更なし。
 */
export function dropInsertIndex(
  from: number,
  over: number,
  clientX: number,
  rect: { left: number; width: number }
): number {
  if (from < 0 || over < 0) return from
  const after = clientX > rect.left + rect.width / 2
  let to = after ? over + 1 : over
  if (from < to) to -= 1
  return Math.max(0, Math.min(to, Number.MAX_SAFE_INTEGER))
}

export function dropSide(clientX: number, rect: { left: number; width: number }): 'before' | 'after' {
  return clientX > rect.left + rect.width / 2 ? 'after' : 'before'
}

/** id 付き配列を、fromId を toIndex へ移して並べ替える。 */
export function moveById<T extends { id: string }>(
  items: readonly T[],
  fromId: string,
  toIndex: number
): T[] {
  const from = items.findIndex((item) => item.id === fromId)
  if (from < 0) return [...items]
  const clamped = Math.max(0, Math.min(toIndex, items.length - 1))
  return moveItem(items, from, clamped)
}

/**
 * open 判定付きリストのうち open なものだけを並べ替え、closed の相対位置は保つ。
 */
export function reorderOpenById<T extends { id: string }>(
  items: readonly T[],
  fromId: string,
  toIndex: number,
  isOpen: (item: T) => boolean
): T[] {
  const open = items.filter(isOpen)
  const from = open.findIndex((item) => item.id === fromId)
  if (from < 0) return [...items]
  const nextOpen = moveItem(open, from, Math.max(0, Math.min(toIndex, open.length - 1)))
  const queue = [...nextOpen]
  return items.map((item) => (isOpen(item) ? queue.shift()! : item))
}

export const EDITOR_TAB_REORDER_MIME = 'application/x-coterea-editor-tab'
export const CHAT_TAB_REORDER_MIME = 'application/x-coterea-chat-tab'
