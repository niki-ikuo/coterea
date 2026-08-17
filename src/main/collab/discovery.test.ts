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
})
