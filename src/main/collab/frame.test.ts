import { describe, expect, it } from 'vitest'
import { encodeFrame, FrameReader } from './frame'

describe('frame', () => {
  it('JSON とバイナリを往復できる', () => {
    const reader = new FrameReader()
    const buf = encodeFrame({ type: 'yjs', docId: 'd1', peerId: 'p' }, Buffer.from([1, 2, 3]))
    const frames = reader.push(buf)
    expect(frames).toHaveLength(1)
    expect(frames[0].msg).toEqual({ type: 'yjs', docId: 'd1', peerId: 'p' })
    expect([...frames[0].binary]).toEqual([1, 2, 3])
  })

  it('分割受信しても組み立てる', () => {
    const reader = new FrameReader()
    const buf = encodeFrame({ type: 'presence', docId: 'x' })
    expect(reader.push(buf.subarray(0, 3))).toEqual([])
    const rest = reader.push(buf.subarray(3))
    expect(rest).toHaveLength(1)
    expect(rest[0].msg.type).toBe('presence')
  })
})
