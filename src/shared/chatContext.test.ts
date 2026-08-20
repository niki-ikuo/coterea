import { describe, expect, it } from 'vitest'
import {
  capsuleFromDrag,
  capsuleLabel,
  capsulesFromDraftParts,
  draftPartsAreBlank,
  emptyDraftParts,
  formatChatContextClipboard,
  insertCapsuleIntoDraftParts,
  mergeContextCapsules,
  parseChatContextClipboard,
  parseChatContextDrag,
  parseSoftLineRef,
  plainTextFromDraftParts,
  primaryTabIdFromCapsules,
  sanitizeContextCapsules,
  shortContextPath
} from './chatContext'

describe('chatContext', () => {
  it('DnD ペイロードをパースする', () => {
    const file = parseChatContextDrag(
      JSON.stringify({
        kind: 'file',
        tabId: 't1',
        title: 'get-weather.sh',
        path: 'C:\\work\\bin\\get-weather.sh',
        language: 'shell'
      })
    )
    expect(file).toEqual({
      kind: 'file',
      tabId: 't1',
      title: 'get-weather.sh',
      path: 'C:\\work\\bin\\get-weather.sh',
      language: 'shell'
    })
  })

  it('パスは末尾セグメントで短く表示する', () => {
    expect(shortContextPath('C:\\repo\\bin\\get-weather.sh', 'get-weather.sh')).toBe('bin/get-weather.sh')
    expect(shortContextPath(null, 'untitled')).toBe('untitled')
  })

  it('選択カプセルは path:行-行 ラベル', () => {
    const sel = capsuleFromDrag(
      {
        kind: 'selection',
        tabId: 't1',
        title: 'get-weather.sh',
        path: '/home/u/bin/get-weather.sh',
        language: 'shell',
        from: 10,
        to: 40,
        lineFrom: 6,
        lineTo: 10,
        text: 'code'
      },
      'c1'
    )
    expect(capsuleLabel(sel)).toBe('bin/get-weather.sh:6-10')
  })

  it('文中の指定位置へカプセルを挿入できる', () => {
    const capsule = capsuleFromDrag(
      {
        kind: 'file',
        tabId: 't1',
        title: 'get-weather.sh',
        path: 'bin/get-weather.sh',
        language: 'shell'
      },
      'c1'
    )
    const parts = insertCapsuleIntoDraftParts([{ type: 'text', text: 'この を直して' }], capsule, 3)
    expect(plainTextFromDraftParts(parts)).toBe('この bin/get-weather.shを直して')
    expect(capsulesFromDraftParts(parts)).toHaveLength(1)
  })

  it('重複カプセルをマージしない', () => {
    const a = capsuleFromDrag({ kind: 'file', tabId: 't1', title: 'a.md', language: 'markdown' }, 'c1')
    const b = capsuleFromDrag({ kind: 'file', tabId: 't1', title: 'a.md', language: 'markdown' }, 'c2')
    expect(mergeContextCapsules([a], b)).toEqual([a])
  })

  it('ラベルと主タブ', () => {
    const file = capsuleFromDrag(
      { kind: 'file', tabId: 't1', title: 'a.md', path: 'docs/a.md', language: 'markdown' },
      'c1'
    )
    const sel = capsuleFromDrag(
      {
        kind: 'selection',
        tabId: 't2',
        title: 'b.md',
        path: 'src/b.md',
        language: 'markdown',
        from: 0,
        to: 1,
        lineFrom: 3,
        lineTo: 5,
        text: 'x'
      },
      'c2'
    )
    expect(capsuleLabel(file)).toBe('docs/a.md')
    expect(capsuleLabel(sel)).toBe('src/b.md:3-5')
    expect(primaryTabIdFromCapsules([file, sel])).toBe('t1')
  })

  it('チャット参照クリップボードを往復できる', () => {
    const payload = {
      kind: 'selection' as const,
      tabId: 't1',
      title: 'get-weather.sh',
      path: 'C:\\work\\bin\\get-weather.sh',
      language: 'shell',
      from: 10,
      to: 40,
      lineFrom: 6,
      lineTo: 10,
      text: 'code'
    }
    const clip = formatChatContextClipboard(payload)
    expect(clip).toContain('≡ bin/get-weather.sh:6-10')
    expect(clip).toContain('coterea-context:')
    const parsed = parseChatContextClipboard(clip)
    expect(parsed.payloads).toHaveLength(1)
    expect(parsed.softRefs).toHaveLength(0)
    expect(parsed.payloads[0]).toMatchObject({ kind: 'selection', lineFrom: 6, lineTo: 10 })
    expect(parsed.remainder).toBe('')
  })

  it('ソフトな行参照 path:行-行 をパースする', () => {
    expect(parseSoftLineRef('bin/get-weather.sh:6-10')).toEqual({
      name: 'bin/get-weather.sh',
      lineFrom: 6,
      lineTo: 10
    })
    expect(parseSoftLineRef('≡ notes.md:3')).toEqual({ name: 'notes.md', lineFrom: 3, lineTo: 3 })
  })

  it('プレースホルダ用の空判定は <br> 由来の改行のみを空とみなす', () => {
    expect(draftPartsAreBlank(emptyDraftParts())).toBe(true)
    expect(draftPartsAreBlank([{ type: 'text', text: '\n' }])).toBe(true)
    expect(draftPartsAreBlank([{ type: 'text', text: '\n\n' }])).toBe(true)
    expect(draftPartsAreBlank([{ type: 'text', text: ' ' }])).toBe(false)
    expect(draftPartsAreBlank([{ type: 'text', text: 'あ' }])).toBe(false)
  })
})
