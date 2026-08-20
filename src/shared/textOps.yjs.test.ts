import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { computeApplyOps, computeTextOps, mapCursorOffset } from './textOps'

function applyOpsToYText(
  ytext: Y.Text,
  doc: Y.Doc,
  ops: { index: number; deleteCount: number; insert: string }[]
): void {
  const sorted = [...ops].sort((a, b) => b.index - a.index || b.deleteCount - a.deleteCount)
  doc.transact(() => {
    for (const op of sorted) {
      if (op.deleteCount > 0) ytext.delete(op.index, op.deleteCount)
      if (op.insert) ytext.insert(op.index, op.insert)
    }
  }, 'ai-apply')
}

describe('Y.Text relative cursor', () => {
  it('未変更行の RelativePosition は残る', () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n')
    const after = before.replace('line 10', 'LINE 10')
    const ops = computeTextOps(before, after)
    const doc = new Y.Doc()
    const ytext = doc.getText('monaco')
    ytext.insert(0, before)
    const cursor = before.indexOf('line 5') + 2
    const rel = Y.createRelativePositionFromTypeIndex(ytext, cursor)
    applyOpsToYText(ytext, doc, ops)
    const abs = Y.createAbsolutePositionFromRelativePosition(rel, doc)
    expect(ytext.toString()).toBe(after)
    expect(abs?.index).toBe(cursor)
    expect(mapCursorOffset(cursor, ops)).toBe(cursor)
  })

  it('全文置換すると RelativePosition は先頭へ落ちる', () => {
    const before = 'aaa\nbbb\nccc'
    const after = 'aaa\nBBB\nccc'
    const doc = new Y.Doc()
    const ytext = doc.getText('monaco')
    ytext.insert(0, before)
    const cursor = 6
    const rel = Y.createRelativePositionFromTypeIndex(ytext, cursor)
    applyOpsToYText(ytext, doc, [{ index: 0, deleteCount: before.length, insert: after }])
    const abs = Y.createAbsolutePositionFromRelativePosition(rel, doc)
    expect(abs?.index).toBe(0)
  })

  it('同一行の1文字変更では前後のカーソルが残る', () => {
    const before = 'hello world from coterea'
    const after = 'hello World from coterea'
    const ops = computeTextOps(before, after)
    const doc = new Y.Doc()
    const ytext = doc.getText('monaco')
    ytext.insert(0, before)
    const left = before.indexOf('hello') + 1
    const right = before.indexOf('from')
    const relLeft = Y.createRelativePositionFromTypeIndex(ytext, left)
    const relRight = Y.createRelativePositionFromTypeIndex(ytext, right)
    applyOpsToYText(ytext, doc, ops)
    expect(ytext.toString()).toBe(after)
    expect(Y.createAbsolutePositionFromRelativePosition(relLeft, doc)?.index).toBe(left)
    expect(Y.createAbsolutePositionFromRelativePosition(relRight, doc)?.index).toBe(right)
  })

  it('HTMLコメント追加では body 直後のカーソルが残る', () => {
    const base = `<head>\n  <meta>\n</head>\n<body>\n  <header></header>\n`
    const current = base.replace('<body>', '<body>abcdefg')
    const proposed = `<head>\n  <!-- c -->\n  <meta>\n</head>\n<body>\n  <!-- h -->\n  <header></header>\n`
    const ops = computeApplyOps(current, { mode: 'replace_all', text: proposed, baseText: base })
    const doc = new Y.Doc()
    const ytext = doc.getText('monaco')
    ytext.insert(0, current)
    const cursor = current.indexOf('abcdefg') + 'abcdefg'.length
    const rel = Y.createRelativePositionFromTypeIndex(ytext, cursor)
    applyOpsToYText(ytext, doc, ops)
    const next = ytext.toString()
    const abs = Y.createAbsolutePositionFromRelativePosition(rel, doc)
    expect(next).toContain('<body>abcdefg')
    expect(next).toContain('<!-- c -->')
    expect(abs?.index).toBe(next.indexOf('abcdefg') + 'abcdefg'.length)
  })
})
