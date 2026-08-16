export type ControlMessage = {
  type: string
  [key: string]: unknown
}

export type Frame = {
  msg: ControlMessage
  binary: Buffer
}

export function encodeFrame(msg: ControlMessage, binary?: Buffer): Buffer {
  const json = Buffer.from(JSON.stringify(msg), 'utf8')
  const bin = binary ?? Buffer.alloc(0)
  const header = Buffer.alloc(8)
  header.writeUInt32BE(json.length, 0)
  header.writeUInt32BE(bin.length, 4)
  return Buffer.concat([header, json, bin])
}

export class FrameReader {
  private buf = Buffer.alloc(0)

  push(chunk: Buffer): Frame[] {
    this.buf = Buffer.concat([this.buf, chunk])
    const frames: Frame[] = []
    while (this.buf.length >= 8) {
      const jsonLen = this.buf.readUInt32BE(0)
      const binLen = this.buf.readUInt32BE(4)
      if (jsonLen > 12_000_000 || binLen > 24_000_000) {
        throw new Error('frame too large')
      }
      const total = 8 + jsonLen + binLen
      if (this.buf.length < total) break
      const json = this.buf.subarray(8, 8 + jsonLen).toString('utf8')
      const binary = Buffer.from(this.buf.subarray(8 + jsonLen, total))
      this.buf = this.buf.subarray(total)
      frames.push({ msg: JSON.parse(json) as ControlMessage, binary })
    }
    return frames
  }
}
