import iconv from 'iconv-lite'
import Encoding from 'encoding-japanese'
import {
  type EncodingId,
  DEFAULT_ENCODING,
  iconvName,
  isEncodingId
} from '../shared/encoding'

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])
const UTF16LE_BOM = Buffer.from([0xff, 0xfe])
const UTF16BE_BOM = Buffer.from([0xfe, 0xff])

function hasPrefix(buf: Buffer, prefix: Buffer): boolean {
  return buf.length >= prefix.length && prefix.equals(buf.subarray(0, prefix.length))
}

function isValidUtf8(buf: Buffer): boolean {
  if (buf.length === 0) return true
  return Buffer.from(buf.toString('utf8'), 'utf8').equals(buf)
}

function nullRatio(buf: Buffer, even: boolean): number {
  if (buf.length < 8) return 0
  let zeros = 0
  let n = 0
  for (let i = even ? 0 : 1; i < buf.length; i += 2) {
    n += 1
    if (buf[i] === 0) zeros += 1
  }
  return n === 0 ? 0 : zeros / n
}

export function detectEncoding(buf: Buffer): EncodingId {
  if (buf.length === 0) return DEFAULT_ENCODING
  if (hasPrefix(buf, UTF8_BOM)) return 'utf8-bom'
  if (hasPrefix(buf, UTF16LE_BOM)) return 'utf16le'
  if (hasPrefix(buf, UTF16BE_BOM)) return 'utf16be'

  const nuls = nullCount(buf)
  const nulDensity = buf.length === 0 ? 0 : nuls / buf.length
  if (buf.length >= 4 && buf.length % 2 === 0 && nulDensity > 0.08) {
    return nullRatio(buf, false) >= nullRatio(buf, true) ? 'utf16le' : 'utf16be'
  }

  if (isValidUtf8(buf) && nulDensity < 0.02) return 'utf8'

  const detected = Encoding.detect(Uint8Array.from(buf))
  switch (detected) {
    case 'UTF8':
    case 'ASCII':
      return nulDensity > 0.08 ? 'utf16le' : 'utf8'
    case 'UTF16':
    case 'UTF16LE':
    case 'UNICODE':
      return 'utf16le'
    case 'UTF16BE':
      return 'utf16be'
    case 'SJIS':
      return 'shiftjis'
    case 'EUCJP':
      return 'eucjp'
    case 'JIS':
      return 'iso2022jp'
    default:
      return 'shiftjis'
  }
}

function nullCount(buf: Buffer): number {
  let n = 0
  for (const b of buf) if (b === 0) n += 1
  return n
}

function stripNuls(text: string): string {
  return text.includes('\u0000') ? text.replace(/\u0000/g, '') : text
}

export function decodeBuffer(buf: Buffer, encoding: EncodingId): string {
  if (encoding === 'utf8-bom' && hasPrefix(buf, UTF8_BOM)) {
    return stripNuls(iconv.decode(buf.subarray(3), 'utf8'))
  }
  if (encoding === 'utf16le' && hasPrefix(buf, UTF16LE_BOM)) {
    return stripNuls(iconv.decode(buf.subarray(2), 'utf16le'))
  }
  if (encoding === 'utf16be' && hasPrefix(buf, UTF16BE_BOM)) {
    return stripNuls(iconv.decode(buf.subarray(2), 'utf16be'))
  }
  return stripNuls(iconv.decode(buf, iconvName(encoding)))
}

export function encodeText(text: string, encoding: EncodingId): Buffer {
  const body = iconv.encode(stripNuls(text), iconvName(encoding))
  if (encoding === 'utf8-bom') return Buffer.concat([UTF8_BOM, body])
  if (encoding === 'utf16le') return Buffer.concat([UTF16LE_BOM, body])
  if (encoding === 'utf16be') return Buffer.concat([UTF16BE_BOM, body])
  return body
}

export function parseEncoding(value: unknown): EncodingId | undefined {
  return typeof value === 'string' && isEncodingId(value) ? value : undefined
}
