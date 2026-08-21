import { describe, expect, it } from 'vitest'
import {
  AI_CONTEXT_FILE_CHARS,
  clipContextBodies,
  clipSelectionText,
  clipText,
  formatOpenTabsCatalog,
  withClipNotice
} from './aiContext'

describe('clipText', () => {
  it('短い本文はそのまま', () => {
    expect(clipText('hello', 100)).toEqual({
      text: 'hello',
      truncated: false,
      originalLength: 5,
      from: 0,
      to: 5
    })
  })

  it('上限を超えたら先頭から切り詰める', () => {
    const clipped = clipText('abcdefghij', 4)
    expect(clipped).toEqual({
      text: 'abcd',
      truncated: true,
      originalLength: 10,
      from: 0,
      to: 4
    })
  })

  it('from/to で範囲読みできる', () => {
    const clipped = clipText('abcdefghij', 100, 2, 8)
    expect(clipped).toEqual({
      text: 'cdefgh',
      truncated: true,
      originalLength: 10,
      from: 2,
      to: 8
    })
  })

  it('範囲が上限より長ければさらに切る', () => {
    const clipped = clipText('abcdefghij', 3, 2, 9)
    expect(clipped.text).toBe('cde')
    expect(clipped.from).toBe(2)
    expect(clipped.to).toBe(5)
    expect(clipped.truncated).toBe(true)
  })
})

describe('clipContextBodies', () => {
  it('合計予算を先頭ファイルから消費する', () => {
    const clipped = clipContextBodies(['aaaa', 'bbbb', 'cccc'], 3, 5)
    expect(clipped.map((c) => c.text)).toEqual(['aaa', 'bb', ''])
    expect(clipped[0].truncated).toBe(true)
    expect(clipped[2].truncated).toBe(true)
  })

  it('既定の1ファイル上限定数が正', () => {
    expect(AI_CONTEXT_FILE_CHARS).toBeGreaterThan(1000)
  })
})

describe('clipSelectionText / notices', () => {
  it('選択も切り詰める', () => {
    expect(clipSelectionText('x'.repeat(20), 5).text).toHaveLength(5)
  })

  it('切り詰め通知を付ける', () => {
    const notice = withClipNotice({
      text: 'ab',
      truncated: true,
      originalLength: 10,
      from: 0,
      to: 2
    })
    expect(notice).toContain('ab')
    expect(notice).toContain('0–2')
    expect(notice).toContain('10')
  })
})

describe('formatOpenTabsCatalog', () => {
  it('本文済みと未読を区別する', () => {
    const text = formatOpenTabsCatalog(
      [
        { id: 'a', title: 'a.md', language: 'markdown', chars: 10 },
        { id: 'b', title: 'b.md', language: 'markdown', chars: 99 }
      ],
      new Set(['a'])
    )
    expect(text).toContain('[開いているタブ]')
    expect(text).toContain('本文は上記')
    expect(text).toContain('read_tab')
  })
})
