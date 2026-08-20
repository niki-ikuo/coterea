import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ContextCapsule, DraftPart } from '../../../shared/chatContext'
import {
  CHAT_CONTEXT_MIME,
  capsuleFromDrag,
  draftPartsAreBlank,
  emptyDraftParts,
  insertCapsuleIntoDraftParts,
  insertTextIntoDraftParts,
  parseChatContextDrag
} from '../../../shared/chatContext'
import { clipboardTextToInserts } from '../lib/chat'
import { preloadEditor } from '../lib/editorReady'
import {
  caretRangeFromPoint,
  placeCaretAfter,
  readPartsFromEditor,
  registerComposerBridge,
  serializeDraftParts,
  textOffsetAtSelection,
  writePartsToEditor
} from '../lib/composerDom'

type Props = {
  parts: DraftPart[]
  placeholder: string
  disabled?: boolean
  onPartsChange: (parts: DraftPart[]) => void
  onSubmit: () => void
}

export function ChatComposerInput({
  parts,
  placeholder,
  disabled,
  onPartsChange,
  onSubmit
}: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const composing = useRef(false)
  const [isComposing, setIsComposing] = useState(false)
  const selfSync = useRef(false)
  const lastSerialized = useRef(serializeDraftParts(parts))
  const partsRef = useRef(parts)
  partsRef.current = parts

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || composing.current) return
    const next = serializeDraftParts(parts)
    if (selfSync.current) {
      selfSync.current = false
      lastSerialized.current = next
      return
    }
    if (next === lastSerialized.current) return
    writePartsToEditor(el, parts)
    lastSerialized.current = next
  }, [parts])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const emitFromDom = (): void => {
      const next = syncPartsFromEditor(el)
      lastSerialized.current = serializeDraftParts(next)
      selfSync.current = true
      onPartsChange(next)
    }

    const insertAtPoint = (capsule: ContextCapsule, clientX?: number, clientY?: number): void => {
      el.focus()
      if (clientX != null && clientY != null) {
        const range = caretRangeFromPoint(clientX, clientY)
        if (range && el.contains(range.startContainer)) {
          const sel = window.getSelection()
          sel?.removeAllRanges()
          sel?.addRange(range)
        }
      }
      const offset = textOffsetAtSelection(el)
      const next = insertCapsuleIntoDraftParts(partsRef.current, capsule, offset)
      writePartsToEditor(el, next)
      // キャレットを挿入チップの後ろへ
      const chip = el.querySelector(`[data-capsule-id="${CSS.escape(capsule.id)}"]`)
      if (chip) placeCaretAfter(chip)
      lastSerialized.current = serializeDraftParts(next)
      selfSync.current = true
      onPartsChange(next)
    }

    const off = registerComposerBridge({
      insert: insertAtPoint,
      textOffset: () => (ref.current ? textOffsetAtSelection(ref.current) : null)
    })

    const onRemoveClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null
      const btn = target?.closest?.('.chat-context-chip-remove')
      if (!btn || !el.contains(btn)) return
      e.preventDefault()
      e.stopPropagation()
      const chip = btn.closest('.chat-context-chip') as HTMLElement | null
      chip?.remove()
      emitFromDom()
    }

    el.addEventListener('click', onRemoveClick)
    return () => {
      off()
      el.removeEventListener('click', onRemoveClick)
    }
  }, [onPartsChange])

  // IME 変換中は ::before プレースホルダーを消す（残すと変換中文字列が説明文の後ろに見える）
  const showPlaceholder = draftPartsAreBlank(parts) && !isComposing

  return (
    <div
      ref={ref}
      className={`chat-input chat-input-rich${showPlaceholder ? ' is-empty' : ''}`}
      role="textbox"
      aria-multiline="true"
      aria-label="メッセージ"
      aria-placeholder={placeholder}
      data-placeholder={placeholder}
      contentEditable={disabled ? false : true}
      suppressContentEditableWarning
      onCompositionStart={() => {
        composing.current = true
        // React 再描画前に即隠し、変換中文字がプレースホルダー末尾に見えないようにする
        ref.current?.classList.remove('is-empty')
        setIsComposing(true)
      }}
      onCompositionEnd={() => {
        composing.current = false
        setIsComposing(false)
        const el = ref.current
        if (!el) return
        const next = syncPartsFromEditor(el)
        lastSerialized.current = serializeDraftParts(next)
        selfSync.current = true
        onPartsChange(next)
      }}
      onBlur={() => {
        // compositionend が欠ける環境向けに、フォーカス外れで IME 状態を戻す
        if (composing.current || isComposing) {
          composing.current = false
          setIsComposing(false)
        }
        const el = ref.current
        if (!el) return
        const next = syncPartsFromEditor(el)
        if (serializeDraftParts(next) === lastSerialized.current) return
        lastSerialized.current = serializeDraftParts(next)
        selfSync.current = true
        onPartsChange(next)
      }}
      onInput={() => {
        if (composing.current) return
        const el = ref.current
        if (!el) return
        const next = syncPartsFromEditor(el)
        lastSerialized.current = serializeDraftParts(next)
        selfSync.current = true
        onPartsChange(next)
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          onSubmit()
        }
      }}
      onPaste={(e) => {
        e.preventDefault()
        const el = ref.current
        if (!el || disabled) return
        const mime = e.clipboardData.getData(CHAT_CONTEXT_MIME)
        const plain = e.clipboardData.getData('text/plain')
        void (async () => {
          await preloadEditor()
          let inserts = clipboardTextToInserts(plain)
          const fromMime = parseChatContextDrag(mime)
          if (fromMime) {
            inserts = [{ type: 'capsule', capsule: capsuleFromDrag(fromMime) }]
          }
          const hasCapsule = inserts.some((item) => item.type === 'capsule')
          if (!hasCapsule) {
            document.execCommand('insertText', false, plain)
            return
          }
          let next = partsRef.current
          let offset = textOffsetAtSelection(el)
          let lastCapsuleId: string | null = null
          for (const item of inserts) {
            if (item.type === 'text') {
              if (!item.text) continue
              next = insertTextIntoDraftParts(next, item.text, offset)
              offset = (offset ?? 0) + item.text.length
              continue
            }
            next = insertCapsuleIntoDraftParts(next, item.capsule, offset)
            lastCapsuleId = item.capsule.id
          }
          writePartsToEditor(el, next)
          if (lastCapsuleId) {
            const chip = el.querySelector(`[data-capsule-id="${CSS.escape(lastCapsuleId)}"]`)
            if (chip) placeCaretAfter(chip)
          }
          lastSerialized.current = serializeDraftParts(next)
          selfSync.current = true
          onPartsChange(next)
        })()
      }}
    />
  )
}

/**
 * contenteditable が空欄に残す `<br>` 由来の改行だけなら、空パーツへ正規化する。
 * 複数改行やスペースはユーザー入力として残す。
 */
function syncPartsFromEditor(el: HTMLElement): DraftPart[] {
  const parts = readPartsFromEditor(el)
  if (!draftPartsAreBlank(parts)) return parts
  // 単一の空行相当（削除後の偽 BR）だけ DOM も空に揃える
  const text = parts.map((p) => (p.type === 'text' ? p.text : '')).join('')
  if (text === '\n' || text === '' || /^[\u200B\uFEFF]*$/.test(text)) {
    writePartsToEditor(el, emptyDraftParts())
    return emptyDraftParts()
  }
  return parts
}
