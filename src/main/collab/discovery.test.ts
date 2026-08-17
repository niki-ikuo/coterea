import { describe, expect, it } from 'vitest'
import { electHub } from './discovery'

describe('electHub', () => {
  it('一人ではハブを立てない', () => {
    expect(electHub([{ peerId: 'a', startedAt: 1 }])).toBeNull()
  })

  it('最古参をハブにする', () => {
    const elected = electHub([
      { peerId: 'new', startedAt: 20 },
      { peerId: 'old', startedAt: 10 }
    ])
    expect(elected?.peerId).toBe('old')
  })

  it('同時刻は peerId の辞書順', () => {
    expect(electHub([{ peerId: 'b', startedAt: 1 }, { peerId: 'a', startedAt: 1 }])?.peerId).toBe('a')
  })

  it('3人でも最古の一人だけ', () => {
    expect(
      electHub([
        { peerId: 'c', startedAt: 30 },
        { peerId: 'a', startedAt: 10 },
        { peerId: 'b', startedAt: 20 }
      ])?.peerId
    ).toBe('a')
  })
})
