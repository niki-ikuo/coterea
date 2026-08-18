import { describe, expect, it } from 'vitest'
import { AwarenessPeerIndex, clientIdsForPeer, collectAwarenessClientIds, clientIdsToDropForPeer } from './awarenessPeers'

describe('clientIdsForPeer', () => {
  it('離脱ピアの clientId だけ返す', () => {
    const states = new Map([
      [1, { user: { peerId: 'me', name: '自分' } }],
      [2, { user: { peerId: 'left', name: 'A' } }],
      [3, { user: { peerId: 'stay', name: 'B' } }]
    ])
    expect(clientIdsForPeer(states, 'left', 1)).toEqual([2])
  })

  it('ローカル clientId は消さない', () => {
    const states = new Map([[7, { user: { peerId: 'left' } }]])
    expect(clientIdsForPeer(states, 'left', 7)).toEqual([])
  })
})

describe('AwarenessPeerIndex', () => {
  it('フレーム由来の clientId をピア単位で忘れる', () => {
    const index = new AwarenessPeerIndex()
    index.note('p1', [10, 11])
    index.note('p2', [20])
    expect(index.forgetPeer('p1')).toEqual([10, 11])
    expect(index.idsOf('p1')).toEqual([])
    expect(index.idsOf('p2')).toEqual([20])
  })
})

describe('collectAwarenessClientIds', () => {
  it('user.peerId が付いていればそれを使う', () => {
    const states: Array<[number, { user?: { peerId?: string } }]> = [
      [1, { user: { peerId: 'local' } }],
      [2, { user: { peerId: 'remote' } }]
    ]
    expect(collectAwarenessClientIds(states, 'remote', new Set(), 1)).toEqual([2])
  })

  it('古いクライアント向けに、新規 clientId を送信元ピアへ紐づける', () => {
    const states: Array<[number, { user?: { peerId?: string } }]> = [
      [1, { user: { peerId: 'local' } }],
      [9, { user: {} }]
    ]
    expect(collectAwarenessClientIds(states, 'old-peer', new Set([1]), 1)).toEqual([9])
  })

  it('他ピアの clientId は送信元に付けない', () => {
    const states: Array<[number, { user?: { peerId?: string } }]> = [
      [1, { user: { peerId: 'local' } }],
      [2, { user: { peerId: 'stay' } }],
      [3, { user: { peerId: 'left' } }]
    ]
    expect(collectAwarenessClientIds(states, 'left', new Set([1]), 1)).toEqual([3])
  })

  it('peerId なしの新規が複数なら送り元に付けない', () => {
    const states: Array<[number, { user?: { peerId?: string } }]> = [
      [1, { user: { peerId: 'local' } }],
      [8, { user: {} }],
      [9, { user: {} }]
    ]
    expect(collectAwarenessClientIds(states, 'left', new Set([1]), 1)).toEqual([])
  })
})

describe('clientIdsToDropForPeer', () => {
  it('インデックスが汚染されていても user.peerId が違うキャレットは残す', () => {
    const states = new Map([
      [1, { user: { peerId: 'me' } }],
      [2, { user: { peerId: 'stay' } }],
      [3, { user: { peerId: 'left' } }]
    ])
    expect(clientIdsToDropForPeer(states, 'left', 1, [2, 3, 4])).toEqual([3])
  })
})
