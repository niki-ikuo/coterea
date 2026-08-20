import { describe, expect, it } from 'vitest'
import {
  applyOpsToString,
  computeApplyOps,
  computeTextOps,
  desiredTextAfterProposal,
  mapCursorOffset,
  matchDocumentEol
} from './textOps'

describe('computeTextOps', () => {
  it('同一なら空', () => {
    expect(computeTextOps('abc', 'abc')).toEqual([])
  })

  it('中央1行だけ差し替える', () => {
    const before = 'a\nb\nc'
    const after = 'a\nx\nc'
    const ops = computeTextOps(before, after)
    expect(applyOpsToString(before, ops)).toBe(after)
    expect(ops.every((op) => op.deleteCount < before.length)).toBe(true)
    const deleted = ops.reduce((n, op) => n + op.deleteCount, 0)
    expect(deleted).toBeLessThan(before.length)
  })

  it('複数箇所の変更でも全文一致する', () => {
    const before = 'a\nb\nc\nd\ne'
    const after = 'a\nB\nc\nD\ne'
    const ops = computeTextOps(before, after)
    expect(applyOpsToString(before, ops)).toBe(after)
    expect(ops.length).toBeGreaterThanOrEqual(2)
  })

  it('末尾追加', () => {
    const before = 'hello'
    const after = 'hello world'
    const ops = computeTextOps(before, after)
    expect(ops).toEqual([{ index: 5, deleteCount: 0, insert: ' world' }])
  })

  it('先頭削除', () => {
    const before = 'xyzabc'
    const after = 'abc'
    const ops = computeTextOps(before, after)
    expect(applyOpsToString(before, ops)).toBe(after)
  })

  it('大きな文書でも未変更行を消さない', () => {
    const head = Array.from({ length: 40 }, (_, i) => `keep-${i}`).join('\n')
    const before = `${head}\nOLD_LINE\n${head}`
    const after = `${head}\nNEW_LINE\n${head}`
    const ops = computeTextOps(before, after)
    expect(applyOpsToString(before, ops)).toBe(after)
    const deleted = ops.reduce((n, op) => n + op.deleteCount, 0)
    expect(deleted).toBeLessThan(20)
  })

  it('CRLF 文書へ LF 提案を揃えると中央だけ差し替わる', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`)
    const before = lines.join('\r\n')
    const afterLf = lines.map((l, i) => (i === 15 ? 'LINE' : l)).join('\n')
    const after = matchDocumentEol(before, afterLf)
    const ops = computeTextOps(before, after)
    expect(applyOpsToString(before, ops)).toBe(after)
    const deleted = ops.reduce((n, op) => n + op.deleteCount, 0)
    expect(deleted).toBeLessThan(20)
  })

  it('同一行の1文字だけ差し替える', () => {
    const before = 'hello world from coterea'
    const after = 'hello World from coterea'
    const ops = computeTextOps(before, after)
    expect(applyOpsToString(before, ops)).toBe(after)
    const deleted = ops.reduce((n, op) => n + op.deleteCount, 0)
    expect(deleted).toBe(1)
  })

  it('行の途中の未変更文字は消さない', () => {
    const before = 'abcXdefYghi'
    const after = 'abcUdefVghi'
    const ops = computeTextOps(before, after)
    expect(applyOpsToString(before, ops)).toBe(after)
    const deleted = ops.reduce((n, op) => n + op.deleteCount, 0)
    expect(deleted).toBe(2)
    expect(ops.length).toBe(2)
  })
})

describe('mapCursorOffset', () => {
  it('変更より前のカーソルはそのまま', () => {
    const ops = computeTextOps('aaa\nbbb\nccc', 'aaa\nBBB\nccc')
    expect(mapCursorOffset(1, ops)).toBe(1)
  })

  it('変更より後のカーソルは挿入長の差だけずれる', () => {
    const before = 'aaa\nbb\nccc'
    const after = 'aaa\nBBBB\nccc'
    const ops = computeTextOps(before, after)
    const from = before.indexOf('ccc')
    expect(mapCursorOffset(from, ops)).toBe(after.indexOf('ccc'))
  })
})

describe('matchDocumentEol', () => {
  it('CRLF 文書なら提案も CRLF にする', () => {
    expect(matchDocumentEol('a\r\nb', 'x\ny')).toBe('x\r\ny')
  })

  it('LF 文書なら LF のまま', () => {
    expect(matchDocumentEol('a\nb', 'x\r\ny')).toBe('x\ny')
  })
})

describe('desiredTextAfterProposal', () => {
  it('replace_all は全文（改行を文書に揃える）', () => {
    expect(desiredTextAfterProposal('old\r\n', { mode: 'replace_all', text: 'new\nline' })).toBe(
      'new\r\nline'
    )
  })

  it('replace_range は切片置換', () => {
    expect(
      desiredTextAfterProposal('hello world', { mode: 'replace_range', text: 'HELLO', from: 0, to: 5 })
    ).toBe('HELLO world')
  })

  it('コメント追加の replace_all でも並行入力の abcdefg を消さない', () => {
    const base = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>香川</title>
</head>
<body>
  <header id="top"></header>
</body>
</html>
`
    const current = base.replace('<body>', '<body>abcdefg')
    const proposed = `<!doctype html>
<html lang="ja">
<head>
  <!-- 文字コード・表示領域・ページ情報を設定 -->
  <meta charset="UTF-8">
  <title>香川</title>
</head>
<body>
  <!-- サイトヘッダー -->
  <header id="top"></header>
</body>
</html>
`
    const next = desiredTextAfterProposal(current, {
      mode: 'replace_all',
      text: proposed,
      baseText: base
    })
    expect(next).toContain('<body>abcdefg')
    expect(next).toContain('<!-- 文字コード・表示領域・ページ情報を設定 -->')
    expect(next).toContain('<!-- サイトヘッダー -->')
    const cursor = current.indexOf('abcdefg') + 'abcdefg'.length
    const ops = computeApplyOps(current, { mode: 'replace_all', text: proposed, baseText: base })
    expect(mapCursorOffset(cursor, ops)).toBe(next.indexOf('abcdefg') + 'abcdefg'.length)
  })
})
