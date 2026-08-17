import { describe, expect, it } from 'vitest'
import { decideHubTick, failedHostKey, filterViablePeers } from './hubTick'

const peer = (
  id: string,
  startedAt: number,
  role: 'solo' | 'host' | 'guest' = 'solo',
  tcpPort: number | null = null
) => ({
  peerId: id,
  startedAt,
  role,
  tcpPort,
  hostAddress: tcpPort ? '127.0.0.1' : undefined
})

describe('decideHubTick', () => {
  it('一人では何もしない', () => {
    expect(
      decideHubTick({
        enabled: true,
        leaving: false,
        connecting: false,
        role: 'solo',
        localPeerId: 'me',
        startedAt: 1,
        holdHost: false,
        clientCount: 0,
        others: []
      })
    ).toEqual({ action: 'idle' })
  })

  it('最古参がハブになる', () => {
    expect(
      decideHubTick({
        enabled: true,
        leaving: false,
        connecting: false,
        role: 'solo',
        localPeerId: 'old',
        startedAt: 1,
        holdHost: false,
        clientCount: 0,
        others: [peer('new', 2)]
      })
    ).toEqual({ action: 'become-host' })
  })

  it('新しい側はハブにならない', () => {
    expect(
      decideHubTick({
        enabled: true,
        leaving: false,
        connecting: false,
        role: 'solo',
        localPeerId: 'new',
        startedAt: 2,
        holdHost: false,
        clientCount: 0,
        others: [peer('old', 1)]
      })
    ).toEqual({ action: 'idle' })
  })

  it('生きているハブがいれば参加する', () => {
    const host = peer('old', 1, 'host', 51234)
    expect(
      decideHubTick({
        enabled: true,
        leaving: false,
        connecting: false,
        role: 'solo',
        localPeerId: 'new',
        startedAt: 2,
        holdHost: false,
        clientCount: 0,
        others: [host]
      })
    ).toEqual({ action: 'join', host })
  })

  it('ハブ切断後、残りの最古参が引き継ぐ', () => {
    expect(
      decideHubTick({
        enabled: true,
        leaving: false,
        connecting: false,
        role: 'solo',
        localPeerId: 'b',
        startedAt: 2,
        holdHost: false,
        clientCount: 0,
        others: [peer('c', 3)]
      })
    ).toEqual({ action: 'become-host' })
  })

  it('クライアントがいなくなり一人になったハブは降りる', () => {
    expect(
      decideHubTick({
        enabled: true,
        leaving: false,
        connecting: false,
        role: 'host',
        localPeerId: 'me',
        startedAt: 1,
        holdHost: false,
        clientCount: 0,
        others: []
      })
    ).toEqual({ action: 'demote' })
  })

  it('手動ハブは一人でも降りない', () => {
    expect(
      decideHubTick({
        enabled: true,
        leaving: false,
        connecting: false,
        role: 'host',
        localPeerId: 'me',
        startedAt: 1,
        holdHost: true,
        clientCount: 0,
        others: []
      })
    ).toEqual({ action: 'idle' })
  })

  it('接続中は再選出しない', () => {
    expect(
      decideHubTick({
        enabled: true,
        leaving: false,
        connecting: true,
        role: 'solo',
        localPeerId: 'old',
        startedAt: 1,
        holdHost: false,
        clientCount: 0,
        others: [peer('new', 2)]
      })
    ).toEqual({ action: 'idle' })
  })
})

describe('filterViablePeers', () => {
  it('失敗したハブはしばらく除外する', () => {
    const host = peer('h', 1, 'host', 9)
    const failed = new Map([[failedHostKey({ peerId: 'h', tcpPort: 9, hostAddress: '127.0.0.1' }), 100]])
    expect(filterViablePeers([host], failed, 50)).toEqual([])
    expect(filterViablePeers([host], failed, 100)).toEqual([host])
  })
})
