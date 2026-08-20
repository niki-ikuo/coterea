/** AI チャットへ DnD で添付するコンテキスト（カプセル）。 */

export const CHAT_CONTEXT_MIME = 'application/x-coterea-context'

type CapsuleBase = {
  id: string
  tabId: string
  title: string
  /** 表示用パス（例: bin/get-weather.sh）。無ければ title */
  path?: string | null
  language: string
}

export type FileContextCapsule = CapsuleBase & {
  kind: 'file'
}

export type SelectionContextCapsule = CapsuleBase & {
  kind: 'selection'
  from: number
  to: number
  lineFrom: number
  lineTo: number
  /** ドロップ時点の抜粋（表示・フォールバック用） */
  text: string
}

export type ContextCapsule = FileContextCapsule | SelectionContextCapsule

export type ChatContextDragPayload =
  | {
      kind: 'file'
      tabId: string
      title: string
      path?: string | null
      language: string
    }
  | {
      kind: 'selection'
      tabId: string
      title: string
      path?: string | null
      language: string
      from: number
      to: number
      lineFrom: number
      lineTo: number
      text: string
    }

/** Compass 風: bin/get-weather.sh のように末尾1〜2セグメントを出す。 */
export function shortContextPath(path: string | null | undefined, title: string): string {
  if (!path || !path.trim()) return title
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return title
  if (parts.length === 1) return parts[0]
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
}

export function capsuleDisplayName(capsule: Pick<ContextCapsule, 'path' | 'title'>): string {
  return shortContextPath(capsule.path, capsule.title)
}

/** 例: bin/get-weather.sh  /  bin/get-weather.sh:6-10 */
export function capsuleLabel(capsule: ContextCapsule): string {
  const name = capsuleDisplayName(capsule)
  if (capsule.kind === 'file') return name
  if (capsule.lineFrom === capsule.lineTo) return `${name}:${capsule.lineFrom}`
  return `${name}:${capsule.lineFrom}-${capsule.lineTo}`
}

export function primaryTabIdFromCapsules(capsules: readonly ContextCapsule[]): string | null {
  return capsules[0]?.tabId ?? null
}

export function parseChatContextDrag(raw: string): ChatContextDragPayload | null {
  try {
    const data = JSON.parse(raw) as Partial<ChatContextDragPayload>
    if (!data || typeof data !== 'object') return null
    const path = typeof data.path === 'string' ? data.path : data.path === null ? null : undefined
    if (data.kind === 'file') {
      if (typeof data.tabId !== 'string' || !data.tabId) return null
      if (typeof data.title !== 'string') return null
      return {
        kind: 'file',
        tabId: data.tabId,
        title: data.title,
        path,
        language: typeof data.language === 'string' ? data.language : 'plaintext'
      }
    }
    if (data.kind === 'selection') {
      if (typeof data.tabId !== 'string' || !data.tabId) return null
      if (typeof data.title !== 'string') return null
      if (typeof data.from !== 'number' || typeof data.to !== 'number' || data.to <= data.from) return null
      if (typeof data.lineFrom !== 'number' || typeof data.lineTo !== 'number') return null
      if (typeof data.text !== 'string' || !data.text) return null
      return {
        kind: 'selection',
        tabId: data.tabId,
        title: data.title,
        path,
        language: typeof data.language === 'string' ? data.language : 'plaintext',
        from: data.from,
        to: data.to,
        lineFrom: data.lineFrom,
        lineTo: data.lineTo,
        text: data.text
      }
    }
    return null
  } catch {
    return null
  }
}

export function capsuleFromDrag(payload: ChatContextDragPayload, id = crypto.randomUUID()): ContextCapsule {
  if (payload.kind === 'file') {
    return {
      id,
      kind: 'file',
      tabId: payload.tabId,
      title: payload.title,
      path: payload.path ?? null,
      language: payload.language
    }
  }
  return {
    id,
    kind: 'selection',
    tabId: payload.tabId,
    title: payload.title,
    path: payload.path ?? null,
    language: payload.language,
    from: payload.from,
    to: payload.to,
    lineFrom: payload.lineFrom,
    lineTo: payload.lineTo,
    text: payload.text
  }
}

/** 同じファイルの重複、同じ範囲の選択の重複を避ける。 */
export function mergeContextCapsules(
  current: readonly ContextCapsule[],
  next: ContextCapsule
): ContextCapsule[] {
  if (next.kind === 'file') {
    if (current.some((c) => c.kind === 'file' && c.tabId === next.tabId)) return [...current]
    return [...current, next]
  }
  if (
    current.some(
      (c) =>
        c.kind === 'selection' &&
        c.tabId === next.tabId &&
        c.from === next.from &&
        c.to === next.to
    )
  ) {
    return [...current]
  }
  return [...current, next]
}

export function sanitizeContextCapsules(raw: unknown): ContextCapsule[] {
  if (!Array.isArray(raw)) return []
  const out: ContextCapsule[] = []
  for (const item of raw) {
    const capsule = sanitizeContextCapsule(item)
    if (capsule) out.push(capsule)
  }
  return out
}

function sanitizeContextCapsule(raw: unknown): ContextCapsule | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<ContextCapsule>
  if (typeof data.id !== 'string' || !data.id) return null
  if (typeof data.tabId !== 'string' || !data.tabId) return null
  if (typeof data.title !== 'string') return null
  const language = typeof data.language === 'string' ? data.language : 'plaintext'
  const path = typeof data.path === 'string' ? data.path : data.path === null ? null : undefined
  if (data.kind === 'file') {
    return { id: data.id, kind: 'file', tabId: data.tabId, title: data.title, path, language }
  }
  if (data.kind === 'selection') {
    if (typeof data.from !== 'number' || typeof data.to !== 'number' || data.to <= data.from) return null
    if (typeof data.lineFrom !== 'number' || typeof data.lineTo !== 'number') return null
    if (typeof data.text !== 'string') return null
    return {
      id: data.id,
      kind: 'selection',
      tabId: data.tabId,
      title: data.title,
      path,
      language,
      from: data.from,
      to: data.to,
      lineFrom: data.lineFrom,
      lineTo: data.lineTo,
      text: data.text
    }
  }
  return null
}

export function writeChatContextDrag(dt: DataTransfer, payload: ChatContextDragPayload): void {
  dt.setData(CHAT_CONTEXT_MIME, JSON.stringify(payload))
  // タブ並べ替え（move）とチャット添付（copy）の両方に使う
  dt.effectAllowed = 'copyMove'
  dt.setData('text/plain', formatChatContextClipboard(payload))
}

export function readChatContextDrag(dt: DataTransfer): ChatContextDragPayload | null {
  const raw = dt.getData(CHAT_CONTEXT_MIME)
  if (raw) return parseChatContextDrag(raw)
  return parseChatContextClipboard(dt.getData('text/plain')).payloads[0] ?? null
}

export const CHAT_CONTEXT_CLIP_MARKER = 'coterea-context:'

function payloadLabel(payload: ChatContextDragPayload): string {
  const name = shortContextPath(payload.path, payload.title)
  if (payload.kind === 'file') return name
  if (payload.lineFrom === payload.lineTo) return `${name}:${payload.lineFrom}`
  return `${name}:${payload.lineFrom}-${payload.lineTo}`
}

/** クリップボード用（人間が読める1行 + 復元用 JSON）。 */
export function formatChatContextClipboard(payload: ChatContextDragPayload): string {
  const icon = payload.kind === 'file' ? '📄' : '≡'
  return `${icon} ${payloadLabel(payload)}\n${CHAT_CONTEXT_CLIP_MARKER}${JSON.stringify(payload)}`
}

export type SoftLineRef = { name: string; lineFrom: number; lineTo: number }

export function parseSoftLineRef(line: string): SoftLineRef | null {
  const trimmed = line.trim().replace(/^[≡📄]\s*/, '')
  if (!trimmed || trimmed.startsWith(CHAT_CONTEXT_CLIP_MARKER)) return null
  const ranged = trimmed.match(/^(.*):(\d+)-(\d+)$/)
  if (ranged) {
    const lineFrom = Number(ranged[2])
    const lineTo = Number(ranged[3])
    if (!Number.isInteger(lineFrom) || !Number.isInteger(lineTo) || lineFrom < 1 || lineTo < lineFrom) return null
    const name = ranged[1].trim()
    if (!name) return null
    return { name, lineFrom, lineTo }
  }
  const single = trimmed.match(/^(.*):(\d+)$/)
  if (!single) return null
  const lineFrom = Number(single[2])
  if (!Number.isInteger(lineFrom) || lineFrom < 1) return null
  const name = single[1].trim()
  if (!name) return null
  return { name, lineFrom, lineTo: lineFrom }
}

export function parseChatContextClipboard(text: string): {
  payloads: ChatContextDragPayload[]
  softRefs: SoftLineRef[]
  remainder: string
} {
  if (!text) return { payloads: [], softRefs: [], remainder: '' }
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const payloads: ChatContextDragPayload[] = []
  const softRefs: SoftLineRef[] = []
  const keep: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const markerAt = line.indexOf(CHAT_CONTEXT_CLIP_MARKER)
    if (markerAt >= 0) {
      const json = line.slice(markerAt + CHAT_CONTEXT_CLIP_MARKER.length).trim()
      const payload = parseChatContextDrag(json)
      if (payload) {
        if (keep.length > 0 && isClipboardLabelLine(keep[keep.length - 1], payload)) {
          keep.pop()
        }
        // 直前の表示行を softRef にしていた場合は捨てる（二重挿入防止）
        if (softRefs.length > 0 && softRefMatchesPayload(softRefs[softRefs.length - 1], payload)) {
          softRefs.pop()
        }
        payloads.push(payload)
        continue
      }
    }
    const next = lines[i + 1]
    // 次行が構造化参照なら、この行はラベルなので softRef にしない
    if (next != null && next.includes(CHAT_CONTEXT_CLIP_MARKER)) {
      keep.push(line)
      continue
    }
    const soft = parseSoftLineRef(line)
    if (soft) {
      softRefs.push(soft)
      continue
    }
    keep.push(line)
  }

  // 末尾の空行は削る
  while (keep.length > 0 && keep[keep.length - 1] === '') keep.pop()
  while (keep.length > 0 && keep[0] === '') keep.shift()
  // 構造化参照のラベル行が keep に残っていれば落とす
  const cleaned = keep.filter((line) => {
    if (!parseSoftLineRef(line)) return true
    return !payloads.some((payload) => isClipboardLabelLine(line, payload))
  })
  return { payloads, softRefs, remainder: cleaned.join('\n') }
}

function softRefMatchesPayload(ref: SoftLineRef, payload: ChatContextDragPayload): boolean {
  if (payload.kind === 'file') {
    return ref.name === payloadLabel(payload) || ref.name === payload.title
  }
  const label = payloadLabel(payload)
  return (
    ref.name === shortContextPath(payload.path, payload.title) &&
    ref.lineFrom === payload.lineFrom &&
    ref.lineTo === payload.lineTo
  ) || `${ref.name}:${ref.lineFrom === ref.lineTo ? ref.lineFrom : `${ref.lineFrom}-${ref.lineTo}`}` === label
}

function isClipboardLabelLine(line: string, payload: ChatContextDragPayload): boolean {
  const trimmed = line.trim().replace(/^[≡📄]\s*/, '')
  return trimmed === payloadLabel(payload)
}

export type DraftTextPart = { type: 'text'; text: string }
export type DraftCapsulePart = { type: 'capsule'; capsule: ContextCapsule }
export type DraftPart = DraftTextPart | DraftCapsulePart

export function emptyDraftParts(): DraftPart[] {
  return [{ type: 'text', text: '' }]
}

export function normalizeDraftParts(parts: readonly DraftPart[]): DraftPart[] {
  const out: DraftPart[] = []
  for (const part of parts) {
    if (part.type === 'text') {
      if (!part.text) continue
      const last = out[out.length - 1]
      if (last?.type === 'text') last.text += part.text
      else out.push({ type: 'text', text: part.text })
      continue
    }
    out.push({ type: 'capsule', capsule: part.capsule })
  }
  if (out.length === 0) return emptyDraftParts()
  if (out[0].type !== 'text') out.unshift({ type: 'text', text: '' })
  if (out[out.length - 1].type !== 'text') out.push({ type: 'text', text: '' })
  return out
}

/** 送信可否・タイトル用。カプセル位置にはラベルを埋め込む。 */
export function plainTextFromDraftParts(parts: readonly DraftPart[]): string {
  let text = ''
  for (const part of parts) {
    if (part.type === 'text') text += part.text
    else text += capsuleLabel(part.capsule)
  }
  return text
}

export function capsulesFromDraftParts(parts: readonly DraftPart[]): ContextCapsule[] {
  const out: ContextCapsule[] = []
  for (const part of parts) {
    if (part.type !== 'capsule') continue
    const merged = mergeContextCapsules(out, part.capsule)
    if (merged.length > out.length) out.push(part.capsule)
  }
  return out
}

export function draftPartsHaveContent(parts: readonly DraftPart[]): boolean {
  return plainTextFromDraftParts(parts).trim().length > 0 || capsulesFromDraftParts(parts).length > 0
}

/**
 * プレースホルダ表示用の空判定。
 * contenteditable が空欄に残す `<br>` 由来の改行や ZWSP のみは空とみなす（スペース入力は空にしない）。
 */
export function draftPartsAreBlank(parts: readonly DraftPart[]): boolean {
  if (capsulesFromDraftParts(parts).length > 0) return false
  return /^[\n\u200B\uFEFF]*$/.test(plainTextFromDraftParts(parts))
}

/** 旧 draft + draftContext から文中パーツへ。カプセルは末尾に置く。 */
export function migrateLegacyDraft(draft: string | undefined, context: ContextCapsule[] | undefined): DraftPart[] {
  const parts: DraftPart[] = [{ type: 'text', text: typeof draft === 'string' ? draft : '' }]
  for (const capsule of context ?? []) {
    parts.push({ type: 'capsule', capsule })
    parts.push({ type: 'text', text: '' })
  }
  return normalizeDraftParts(parts)
}

export function sanitizeDraftParts(raw: unknown): DraftPart[] | null {
  if (!Array.isArray(raw)) return null
  const out: DraftPart[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const data = item as Partial<DraftPart>
    if (data.type === 'text' && typeof (data as DraftTextPart).text === 'string') {
      out.push({ type: 'text', text: (data as DraftTextPart).text })
      continue
    }
    if (data.type === 'capsule') {
      const capsule = sanitizeContextCapsule((data as DraftCapsulePart).capsule)
      if (capsule) out.push({ type: 'capsule', capsule })
    }
  }
  return normalizeDraftParts(out)
}

/** キャレット用のテキストオフセット（テキスト連結上）へカプセルを挿入。 */
export function insertCapsuleIntoDraftParts(
  parts: readonly DraftPart[],
  capsule: ContextCapsule,
  textOffset: number | null
): DraftPart[] {
  const normalized = normalizeDraftParts(parts)
  if (capsulesFromDraftParts(normalized).some((c) => c.id === capsule.id)) {
    return normalized
  }
  // 同内容の重複は merge 規則に合わせる
  if (mergeContextCapsules(capsulesFromDraftParts(normalized), capsule).length === capsulesFromDraftParts(normalized).length) {
    return normalized
  }

  if (textOffset == null || textOffset < 0) {
    return normalizeDraftParts([...normalized, { type: 'capsule', capsule }, { type: 'text', text: '' }])
  }

  let remaining = textOffset
  const out: DraftPart[] = []
  let inserted = false
  for (const part of normalized) {
    if (part.type === 'capsule') {
      out.push(part)
      continue
    }
    if (inserted) {
      out.push(part)
      continue
    }
    if (remaining > part.text.length) {
      out.push(part)
      remaining -= part.text.length
      continue
    }
    const before = part.text.slice(0, remaining)
    const after = part.text.slice(remaining)
    if (before) out.push({ type: 'text', text: before })
    out.push({ type: 'capsule', capsule })
    out.push({ type: 'text', text: after })
    inserted = true
  }
  if (!inserted) {
    out.push({ type: 'capsule', capsule })
    out.push({ type: 'text', text: '' })
  }
  return normalizeDraftParts(out)
}

/** テキスト連結上のオフセットへ文字列を挿入。 */
export function insertTextIntoDraftParts(
  parts: readonly DraftPart[],
  text: string,
  textOffset: number | null
): DraftPart[] {
  if (!text) return normalizeDraftParts(parts)
  const normalized = normalizeDraftParts(parts)
  if (textOffset == null || textOffset < 0) {
    const last = normalized[normalized.length - 1]
    if (last?.type === 'text') {
      return normalizeDraftParts([
        ...normalized.slice(0, -1),
        { type: 'text', text: last.text + text }
      ])
    }
    return normalizeDraftParts([...normalized, { type: 'text', text }])
  }
  let remaining = textOffset
  const out: DraftPart[] = []
  let inserted = false
  for (const part of normalized) {
    if (part.type === 'capsule') {
      out.push(part)
      continue
    }
    if (inserted) {
      out.push(part)
      continue
    }
    if (remaining > part.text.length) {
      out.push(part)
      remaining -= part.text.length
      continue
    }
    out.push({
      type: 'text',
      text: part.text.slice(0, remaining) + text + part.text.slice(remaining)
    })
    inserted = true
  }
  if (!inserted) out.push({ type: 'text', text })
  return normalizeDraftParts(out)
}

export function removeCapsuleFromDraftParts(parts: readonly DraftPart[], capsuleId: string): DraftPart[] {
  return normalizeDraftParts(parts.filter((p) => p.type !== 'capsule' || p.capsule.id !== capsuleId))
}
