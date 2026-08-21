import { describe, expect, it } from 'vitest'
import {
  earlierPeer,
  electFileSaver,
  fileSessionSyncKey,
  idsOverlap,
  messageKeys,
  offerKeys,
  shouldApplyCollabSnapshot,
  collabSyncHint
} from './fileSession'

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

describe('electFileSaver', () => {
  it('共同編集相手がいるとき最古参が保存する', () => {
    const saver = electFileSaver({ peerId: 'me', startedAt: 20 }, [{ peerId: 'old', startedAt: 10 }], [
      'local:a:1:2'
    ])
    expect(saver?.peerId).toBe('old')
  })

  it('自分が最古なら自分が保存する', () => {
    const saver = electFileSaver({ peerId: 'me', startedAt: 1 }, [{ peerId: 'new', startedAt: 9 }], [
      'unc:host/share/a.txt'
    ])
    expect(saver?.peerId).toBe('me')
  })

  it('無題や相手なしでは保存権を選ばない', () => {
    expect(electFileSaver({ peerId: 'me', startedAt: 1 }, [{ peerId: 'x', startedAt: 2 }], [])).toBeNull()
    expect(electFileSaver({ peerId: 'me', startedAt: 1 }, [], ['local:a:1:2'])).toBeNull()
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

describe('collab snapshot / sync key', () => {
  it('同期キーは参加者の増減では変わらない', () => {
    const keys = ['unc:a/c$/f.txt']
    expect(fileSessionSyncKey(1, keys, 'doc')).toBe(fileSessionSyncKey(1, keys, 'doc'))
    expect(fileSessionSyncKey(1, keys, 'doc')).not.toBe(fileSessionSyncKey(2, keys, 'doc'))
  })

  it('一度載せた正本スナップショットは再適用しない', () => {
    const applied = new Set<string>()
    expect(shouldApplyCollabSnapshot(applied, 'd1')).toBe(true)
    applied.add('d1')
    expect(shouldApplyCollabSnapshot(applied, 'd1')).toBe(false)
    expect(shouldApplyCollabSnapshot(applied, 'd2')).toBe(true)
  })
})

describe('collabSyncHint', () => {
  it('共有中ならヒントなし', () => {
    expect(
      collabSyncHint({
        connected: true,
        sharedTitles: ['a.md'],
        localTitles: ['a.md'],
        remoteTitles: ['a.md']
      }).identityHint
    ).toBeNull()
  })

  it('接続だけだと未同期の理由を出す', () => {
    const bothLocal = collabSyncHint({
      connected: true,
      sharedTitles: [],
      localTitles: ['notes.md'],
      remoteTitles: ['notes.md']
    })
    expect(bothLocal.identityHint).toMatch(/同一実体ではありません/)
    expect(bothLocal.remoteFileTitles).toEqual(['notes.md'])

    const empty = collabSyncHint({
      connected: true,
      sharedTitles: [],
      localTitles: [],
      remoteTitles: []
    })
    expect(empty.identityHint).toMatch(/無題バッファ/)
  })

  it('未接続ならヒントなし', () => {
    expect(
      collabSyncHint({
        connected: false,
        sharedTitles: [],
        localTitles: ['a.md'],
        remoteTitles: ['a.md']
      }).identityHint
    ).toBeNull()
  })
})
