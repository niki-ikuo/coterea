import type { ChatContextDragPayload } from '../../../shared/chatContext'

type Listener = () => void

let pointerPayload: ChatContextDragPayload | null = null
let pointerActive = false
const listeners = new Set<Listener>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function subscribeContextPointerDrag(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isContextPointerDragging(): boolean {
  return pointerActive
}

export function getContextPointerPayload(): ChatContextDragPayload | null {
  return pointerPayload
}

export function beginContextPointerDrag(payload: ChatContextDragPayload): void {
  pointerPayload = payload
  pointerActive = true
  notify()
}

export function endContextPointerDrag(): ChatContextDragPayload | null {
  const payload = pointerActive ? pointerPayload : null
  pointerPayload = null
  pointerActive = false
  notify()
  return payload
}

export function cancelContextPointerDrag(): void {
  if (!pointerActive && !pointerPayload) return
  pointerPayload = null
  pointerActive = false
  notify()
}
