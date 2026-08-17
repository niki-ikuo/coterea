import { describe, expect, it } from 'vitest'
import { earlierPeer, idsOverlap, messageKeys, offerKeys } from './fileSession'

describe('idsOverlap', () => {
  it('重なる識別子があれば同一実体', () => {
    expect(idsOverlap(['local:a:1:2'], ['unc:host/share/a.txt', 'local:a:1:2'])).toBe(true)
  })

  it('無題（空）は同期しない', () => {
    expect(idsOverlap([], ['local:a:1:2'])).toBe(false)
    expect(idsOverlap(undefined, ['x'])).toBe(false)
  })

  it('別実体は重ならない', () => {
    expect(idsOverlap(['local:a:1:2'], ['local:a:1:3'])).toBe(false)
  })
})

describe('earlierPeer', () => {
  it('startedAt が先のピアを正本側にする', () => {
    expect(earlierPeer({ peerId: 'b', startedAt: 1 }, { peerId: 'a', startedAt: 2 })).toBe(true)
  })

  it('同時刻は peerId の辞書順', () => {
    expect(earlierPeer({ peerId: 'a', startedAt: 1 }, { peerId: 'b', startedAt: 1 })).toBe(true)
    expect(earlierPeer({ peerId: 'b', startedAt: 1 }, { peerId: 'a', startedAt: 1 })).toBe(false)
  })
})

describe('offerKeys / messageKeys', () => {
  it('keys 配列を優先する', () => {
    expect(offerKeys({ docId: '1', keys: ['a'], title: 't', language: 'plaintext', key: 'old' })).toEqual(['a'])
  })

  it('制御メッセージから keys を読む', () => {
    expect(messageKeys({ keys: ['x', 'y'] })).toEqual(['x', 'y'])
    expect(messageKeys({ key: 'x' })).toEqual(['x'])
    expect(messageKeys({})).toEqual([])
  })
})
