import type { ContextCapsule, DraftPart } from '../../../shared/chatContext'
import { capsuleLabel, normalizeDraftParts } from '../../../shared/chatContext'

type InsertFn = (capsule: ContextCapsule, clientX?: number, clientY?: number) => void

let insertFn: InsertFn | null = null
let textOffsetFn: (() => number | null) | null = null

export function registerComposerBridge(input: {
  insert: InsertFn
  textOffset: () => number | null
}): () => void {
  insertFn = input.insert
  textOffsetFn = input.textOffset
  return () => {
    if (insertFn === input.insert) insertFn = null
    if (textOffsetFn === input.textOffset) textOffsetFn = null
  }
}

export function composerInsertCapsule(capsule: ContextCapsule, clientX?: number, clientY?: number): boolean {
  if (!insertFn) return false
  insertFn(capsule, clientX, clientY)
  return true
}

export function composerTextOffset(): number | null {
  return textOffsetFn?.() ?? null
}

export function serializeDraftParts(parts: readonly DraftPart[]): string {
  return JSON.stringify(normalizeDraftParts(parts))
}

export function buildChipElement(capsule: ContextCapsule): HTMLSpanElement {
  const chip = document.createElement('span')
  chip.className = `chat-context-chip kind-${capsule.kind} is-inline`
  chip.contentEditable = 'false'
  chip.dataset.capsule = JSON.stringify(capsule)
  chip.dataset.capsuleId = capsule.id
  chip.setAttribute('title', capsuleLabel(capsule))

  const icon = document.createElement('span')
  icon.className = 'chat-context-chip-icon'
  icon.setAttribute('aria-hidden', 'true')
  icon.textContent = capsule.kind === 'file' ? '📄' : '≡'

  const label = document.createElement('span')
  label.className = 'chat-context-chip-label'
  label.textContent = capsuleLabel(capsule)

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'chat-context-chip-remove'
  remove.setAttribute('aria-label', `${capsuleLabel(capsule)} を外す`)
  remove.textContent = '×'

  chip.append(icon, label, remove)
  return chip
}

export function writePartsToEditor(el: HTMLElement, parts: readonly DraftPart[]): void {
  const normalized = normalizeDraftParts(parts)
  el.replaceChildren()
  for (const part of normalized) {
    if (part.type === 'text') {
      appendTextWithBreaks(el, part.text)
    } else {
      el.appendChild(buildChipElement(part.capsule))
    }
  }
  if (el.childNodes.length === 0) el.appendChild(document.createTextNode(''))
}

function appendTextWithBreaks(parent: HTMLElement, text: string): void {
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    if (line) parent.appendChild(document.createTextNode(line))
    if (index < lines.length - 1) parent.appendChild(document.createElement('br'))
  })
}

export function readPartsFromEditor(el: HTMLElement): DraftPart[] {
  const parts: DraftPart[] = []
  const pushText = (text: string): void => {
    if (!text) return
    const last = parts[parts.length - 1]
    if (last?.type === 'text') last.text += text
    else parts.push({ type: 'text', text })
  }

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.textContent ?? '')
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as HTMLElement
    if (element.dataset.capsule) {
      try {
        const capsule = JSON.parse(element.dataset.capsule) as ContextCapsule
        if (capsule?.id) parts.push({ type: 'capsule', capsule })
      } catch {
        /* ignore */
      }
      return
    }
    if (element.tagName === 'BR') {
      pushText('\n')
      return
    }
    for (const child of Array.from(element.childNodes)) walk(child)
  }

  for (const child of Array.from(el.childNodes)) walk(child)
  return normalizeDraftParts(parts)
}

/** エディタ内キャレットまでのプレーンテキスト長（カプセルは長さ0）。 */
export function textOffsetAtSelection(root: HTMLElement): number | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer)) return null

  const pre = document.createRange()
  pre.selectNodeContents(root)
  pre.setEnd(range.startContainer, range.startOffset)

  let offset = 0
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length ?? 0
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as HTMLElement
    if (element.dataset.capsule) return
    if (element.tagName === 'BR') {
      offset += 1
      return
    }
    for (const child of Array.from(element.childNodes)) walk(child)
  }

  // pre の内容を数える代わりに、root を走査して range 手前まで
  const counter = document.createTreeWalker(root, NodeFilter.SHOW_ALL)
  let node: Node | null = counter.currentNode
  // simpler: clone pre to string length for text, but chips inflate
  // Use startContainer walk:
  offset = 0
  const measureUntil = (node: Node, endNode: Node, endOffset: number): boolean => {
    if (node === endNode) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += Math.min(endOffset, node.textContent?.length ?? 0)
        return true
      }
      // element end: count children until endOffset
      const children = Array.from(node.childNodes)
      for (let i = 0; i < endOffset && i < children.length; i++) {
        if (measureAll(children[i])) return true
      }
      return true
    }
    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length ?? 0
      return false
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement
      if (element.dataset.capsule) return false
      if (element.tagName === 'BR') {
        offset += 1
        return false
      }
      for (const child of Array.from(node.childNodes)) {
        if (measureUntil(child, endNode, endOffset)) return true
      }
    }
    return false
  }
  const measureAll = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length ?? 0
      return false
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement
      if (element.dataset.capsule) return false
      if (element.tagName === 'BR') {
        offset += 1
        return false
      }
      for (const child of Array.from(node.childNodes)) measureAll(child)
    }
    return false
  }

  for (const child of Array.from(root.childNodes)) {
    if (measureUntil(child, range.startContainer, range.startOffset)) break
  }
  void node
  return offset
}

export function placeCaretAfter(node: Node): void {
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  range.setStartAfter(node)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

export function caretRangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  if (typeof doc.caretRangeFromPoint === 'function') {
    return doc.caretRangeFromPoint(x, y)
  }
  if (typeof doc.caretPositionFromPoint === 'function') {
    const pos = doc.caretPositionFromPoint(x, y)
    if (!pos) return null
    const range = document.createRange()
    range.setStart(pos.offsetNode, pos.offset)
    range.collapse(true)
    return range
  }
  return null
}
