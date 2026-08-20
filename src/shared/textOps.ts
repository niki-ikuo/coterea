import { diffLines } from './lineDiff'

export type TextOp = {
  index: number
  deleteCount: number
  insert: string
}

const CHAR_DIFF_MAX_D = 2_000

/** 文書側の改行スタイル。CRLF と LF が混在するときは多い方。 */
export function detectDocumentEol(document: string): '\r\n' | '\n' {
  const crlf = (document.match(/\r\n/g) ?? []).length
  let lfOnly = 0
  for (let i = 0; i < document.length; i++) {
    if (document[i] === '\n' && (i === 0 || document[i - 1] !== '\r')) lfOnly += 1
  }
  if (crlf > lfOnly) return '\r\n'
  return '\n'
}

/**
 * AI 提案などは LF になりがちなので、適用先文書の改行に揃える。
 * 揃えないと行差分がほぼ全文置換になり、共同編集のカーソルが飛ぶ。
 */
export function matchDocumentEol(document: string, text: string): string {
  const lf = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (detectDocumentEol(document) === '\r\n') return lf.replace(/\n/g, '\r\n')
  return lf
}

/** before に ops を末尾から適用した結果（検証用）。 */
export function applyOpsToString(text: string, ops: readonly TextOp[]): string {
  const sorted = [...ops].sort((a, b) => b.index - a.index || b.deleteCount - a.deleteCount)
  let next = text
  for (const op of sorted) {
    if (op.index < 0 || op.index + op.deleteCount > next.length) {
      throw new Error(`invalid op at ${op.index}+${op.deleteCount} on length ${next.length}`)
    }
    next = next.slice(0, op.index) + op.insert + next.slice(op.index + op.deleteCount)
  }
  return next
}

/**
 * 変更前オフセットを ops 適用後のオフセットへ写す。
 * 削除範囲内のカーソルは、その挿入の末尾へ寄せる。
 */
export function mapCursorOffset(index: number, ops: readonly TextOp[]): number {
  let pos = index
  const sorted = [...ops].sort((a, b) => b.index - a.index || b.deleteCount - a.deleteCount)
  for (const op of sorted) {
    if (pos < op.index) continue
    if (pos < op.index + op.deleteCount) {
      pos = op.index + op.insert.length
    } else {
      pos += op.insert.length - op.deleteCount
    }
  }
  return Math.max(0, pos)
}

/**
 * before → after の挿入／削除列。
 * 共通接頭・接尾を残し、中央は行→文字の順で hunk 分割する。
 * 未変更の Y.Text アイテムを消さないことが共同編集カーソル維持の条件。
 */
export function computeTextOps(before: string, after: string): TextOp[] {
  if (before === after) return []
  try {
    const ops = mergeAdjacentOps(buildOps(before, after))
    if (ops.length === 0) return prefixSuffixReplace(before, after)
    if (applyOpsToString(before, ops) !== after) return prefixSuffixReplace(before, after)
    return ops
  } catch {
    return prefixSuffixReplace(before, after)
  }
}

function prefixSuffixSpan(before: string, after: string): {
  start: number
  midBefore: string
  midAfter: string
} {
  let start = 0
  const minLen = Math.min(before.length, after.length)
  while (start < minLen && before.charCodeAt(start) === after.charCodeAt(start)) start += 1

  let endBefore = before.length
  let endAfter = after.length
  while (
    endBefore > start &&
    endAfter > start &&
    before.charCodeAt(endBefore - 1) === after.charCodeAt(endAfter - 1)
  ) {
    endBefore -= 1
    endAfter -= 1
  }

  return {
    start,
    midBefore: before.slice(start, endBefore),
    midAfter: after.slice(start, endAfter)
  }
}

function prefixSuffixReplace(before: string, after: string): TextOp[] {
  const { start, midBefore, midAfter } = prefixSuffixSpan(before, after)
  if (!midBefore && !midAfter) return []
  return [{ index: start, deleteCount: midBefore.length, insert: midAfter }]
}

function buildOps(before: string, after: string): TextOp[] {
  if (before === after) return []
  const hasLines = before.includes('\n') || after.includes('\n')
  if (hasLines) {
    const hunks = hunksFromLineDiff(before, after, 0)
    if (hunks.length === 0) return prefixSuffixReplace(before, after)
    const out: TextOp[] = []
    for (const hunk of hunks) {
      const del = before.slice(hunk.index, hunk.index + hunk.deleteCount)
      out.push(...refineHunk(hunk.index, del, hunk.insert))
    }
    return out.length > 0 ? out : prefixSuffixReplace(before, after)
  }

  const { start, midBefore, midAfter } = prefixSuffixSpan(before, after)
  if (!midBefore && !midAfter) return []
  if (!midBefore) return [{ index: start, deleteCount: 0, insert: midAfter }]
  if (!midAfter) return [{ index: start, deleteCount: midBefore.length, insert: '' }]
  const charOps = verifiedCharOps(midBefore, midAfter, start)
  if (charOps) return charOps
  return [{ index: start, deleteCount: midBefore.length, insert: midAfter }]
}

function refineHunk(index: number, deleted: string, insert: string): TextOp[] {
  const { start, midBefore, midAfter } = prefixSuffixSpan(deleted, insert)
  const at = index + start
  if (!midBefore && !midAfter) return []
  const charOps = verifiedCharOps(midBefore, midAfter, at)
  if (charOps) return charOps
  return [{ index: at, deleteCount: midBefore.length, insert: midAfter }]
}

function verifiedCharOps(before: string, after: string, baseOffset: number): TextOp[] | null {
  const charOps = opsFromCharDiff(before, after, baseOffset)
  if (!charOps) return null
  try {
    const rel = charOps.map((op) => ({ ...op, index: op.index - baseOffset }))
    if (applyOpsToString(before, rel) !== after) return null
    return charOps
  } catch {
    return null
  }
}

function opsFromCharDiff(before: string, after: string, baseOffset: number): TextOp[] | null {
  const diffs = diffUtf16(before, after)
  if (!diffs) return null
  const ops: TextOp[] = []
  let bPos = 0
  let i = 0
  while (i < diffs.length) {
    if (diffs[i].type === 'eq') {
      bPos += diffs[i].text.length
      i += 1
      continue
    }
    const startB = bPos
    let insert = ''
    while (i < diffs.length && diffs[i].type !== 'eq') {
      if (diffs[i].type === 'del') bPos += diffs[i].text.length
      else insert += diffs[i].text
      i += 1
    }
    if (bPos - startB > 0 || insert.length > 0) {
      ops.push({ index: baseOffset + startB, deleteCount: bPos - startB, insert })
    }
  }
  return ops
}

type Utf16Diff = { type: 'eq' | 'del' | 'add'; text: string }

/** UTF-16 単位の Myers。Y.Text の index と揃える。大きすぎるときは null。 */
function diffUtf16(before: string, after: string): Utf16Diff[] | null {
  const n = before.length
  const m = after.length
  const max = n + m
  const limit = Math.min(max, CHAR_DIFF_MAX_D)
  const v = new Int32Array(2 * max + 1)
  const traces: Int32Array[] = []
  let done = false
  let doneD = -1
  for (let d = 0; d <= limit; d++) {
    traces.push(Int32Array.from(v))
    for (let k = -d; k <= d; k += 2) {
      const kIndex = k + max
      let x: number
      if (k === -d || (k !== d && v[kIndex - 1] < v[kIndex + 1])) {
        x = v[kIndex + 1]
      } else {
        x = v[kIndex - 1] + 1
      }
      let y = x - k
      while (x < n && y < m && before.charCodeAt(x) === after.charCodeAt(y)) {
        x += 1
        y += 1
      }
      v[kIndex] = x
      if (x >= n && y >= m) {
        done = true
        doneD = d
        break
      }
    }
    if (done) return backtrackUtf16(before, after, traces, max, doneD)
  }
  return null
}

function backtrackUtf16(
  before: string,
  after: string,
  traces: Int32Array[],
  max: number,
  doneD: number
): Utf16Diff[] {
  const out: Utf16Diff[] = []
  let x = before.length
  let y = after.length
  for (let d = doneD; d >= 0; d--) {
    const v = traces[d]
    const k = x - y
    const kIndex = k + max
    let prevK: number
    if (k === -d || (k !== d && v[kIndex - 1] < v[kIndex + 1])) {
      prevK = k + 1
    } else {
      prevK = k - 1
    }
    const prevX = v[prevK + max]
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      x -= 1
      y -= 1
      out.push({ type: 'eq', text: before[x] })
    }
    if (d === 0) break
    if (x > prevX) {
      x -= 1
      out.push({ type: 'del', text: before[x] })
    } else if (y > prevY) {
      y -= 1
      out.push({ type: 'add', text: after[y] })
    }
  }
  out.reverse()
  return mergeUtf16Diffs(out)
}

function mergeUtf16Diffs(diffs: Utf16Diff[]): Utf16Diff[] {
  const out: Utf16Diff[] = []
  for (const d of diffs) {
    const last = out[out.length - 1]
    if (last && last.type === d.type) last.text += d.text
    else out.push({ type: d.type, text: d.text })
  }
  return out
}

function hunksFromLineDiff(before: string, after: string, baseOffset: number): TextOp[] {
  const diffs = diffLines(before, after)
  const ops: TextOp[] = []
  let bPos = 0
  let i = 0

  while (i < diffs.length) {
    if (diffs[i].type === 'eq') {
      bPos = advanceOverLine(before, bPos, diffs[i].text)
      i += 1
      continue
    }

    const startB = bPos
    let endB = bPos
    const addLines: string[] = []
    while (i < diffs.length && diffs[i].type !== 'eq') {
      if (diffs[i].type === 'del') {
        endB = advanceOverLine(before, endB, diffs[i].text)
      } else {
        addLines.push(diffs[i].text)
      }
      i += 1
    }

    const deleted = before.slice(startB, endB)
    let insert = addLines.join('\n')
    if (insert.length > 0 && !insert.endsWith('\n') && (i < diffs.length || after.endsWith('\n'))) {
      insert += '\n'
    } else if (deleted.endsWith('\n') && insert.length > 0 && !insert.endsWith('\n')) {
      insert += '\n'
    }

    bPos = endB
    if (endB - startB > 0 || insert.length > 0) {
      ops.push({ index: baseOffset + startB, deleteCount: endB - startB, insert })
    }
  }

  return ops
}

function advanceOverLine(text: string, pos: number, line: string): number {
  const next = pos + line.length
  if (next < text.length && text[next] === '\n') return next + 1
  return next
}

function mergeAdjacentOps(ops: readonly TextOp[]): TextOp[] {
  if (ops.length <= 1) return [...ops]
  const fwd = [...ops].sort((a, b) => a.index - b.index || a.deleteCount - b.deleteCount)
  const out: TextOp[] = []
  for (const op of fwd) {
    const last = out[out.length - 1]
    if (last && last.index + last.deleteCount === op.index) {
      last.deleteCount += op.deleteCount
      last.insert += op.insert
    } else {
      out.push({ ...op })
    }
  }
  return out
}

function proposedSnapshot(
  current: string,
  proposal: {
    mode: 'replace_all' | 'replace_range'
    text: string
    from?: number
    to?: number
    baseText?: string
  }
): { base: string; proposed: string } {
  const rawBase = proposal.baseText ?? current
  const rawProposed =
    proposal.mode === 'replace_all'
      ? proposal.text
      : rawBase.slice(0, proposal.from ?? 0) + proposal.text + rawBase.slice(proposal.to ?? 0)
  return {
    base: matchDocumentEol(current, rawBase),
    proposed: matchDocumentEol(current, rawProposed)
  }
}

type MergePiece = { ch: string; src: 'base' | 'user' | 'ai'; i?: number }

function piecesFromBase(base: string): MergePiece[] {
  const out: MergePiece[] = []
  for (let i = 0; i < base.length; i++) out.push({ ch: base[i], src: 'base', i })
  return out
}

function applyIndexedOps(pieces: MergePiece[], ops: readonly TextOp[], src: 'user' | 'ai'): MergePiece[] {
  const sorted = [...ops].sort((a, b) => b.index - a.index || b.deleteCount - a.deleteCount)
  let next = pieces
  for (const op of sorted) {
    const insert: MergePiece[] = []
    for (let i = 0; i < op.insert.length; i++) insert.push({ ch: op.insert[i], src })
    next = [...next.slice(0, op.index), ...insert, ...next.slice(op.index + op.deleteCount)]
  }
  return next
}

function applyAiOpKeepingUser(pieces: MergePiece[], op: TextOp): MergePiece[] {
  const delStart = op.index
  const delEnd = op.index + op.deleteCount
  const insert: MergePiece[] = []
  for (let i = 0; i < op.insert.length; i++) insert.push({ ch: op.insert[i], src: 'ai' })

  const next: MergePiece[] = []
  let inserted = false
  const flushInsert = (): void => {
    if (inserted) return
    next.push(...insert)
    inserted = true
  }

  for (const piece of pieces) {
    if (piece.src === 'base' && piece.i != null && piece.i >= delStart && piece.i < delEnd) {
      if (piece.i === delStart) flushInsert()
      continue
    }
    if (!inserted && piece.src === 'base' && piece.i != null && piece.i >= op.index) {
      flushInsert()
    }
    next.push(piece)
  }
  flushInsert()
  return next
}

/** スナップショット→提案の変更を、ユーザーが後から打った文字を消さずに載せる。 */
export function mergeSnapshotEdits(base: string, current: string, proposed: string): string {
  if (base === current) return proposed
  if (base === proposed) return current
  const userOps = computeTextOps(base, current)
  const aiOps = computeTextOps(base, proposed)
  let pieces = applyIndexedOps(piecesFromBase(base), userOps, 'user')
  const sortedAi = [...aiOps].sort((a, b) => b.index - a.index || b.deleteCount - a.deleteCount)
  for (const op of sortedAi) pieces = applyAiOpKeepingUser(pieces, op)
  return pieces.map((p) => p.ch).join('')
}

/** 提案を今の文書へ載せる挿入／削除列（スナップショット基準の 3-way）。 */
export function computeApplyOps(
  current: string,
  proposal: {
    mode: 'replace_all' | 'replace_range'
    text: string
    from?: number
    to?: number
    baseText?: string
  }
): TextOp[] {
  const { base, proposed } = proposedSnapshot(current, proposal)
  const merged = mergeSnapshotEdits(base, current, proposed)
  return computeTextOps(current, merged)
}

/** 提案適用後の文書全文。AI の全文ではなく、今の文書にパッチを載せた結果。 */
export function desiredTextAfterProposal(
  current: string,
  proposal: {
    mode: 'replace_all' | 'replace_range'
    text: string
    from?: number
    to?: number
    baseText?: string
  }
): string {
  const { base, proposed } = proposedSnapshot(current, proposal)
  return mergeSnapshotEdits(base, current, proposed)
}
