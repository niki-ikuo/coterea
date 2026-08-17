export type UnsupportedKind = 'office' | 'pdf' | 'binary'

export type UnsupportedOpen = {
  unsupported: true
  kind: UnsupportedKind
  path: string
}

const OFFICE_EXT = new Set([
  'doc',
  'docx',
  'docm',
  'dot',
  'dotx',
  'dotm',
  'xls',
  'xlsx',
  'xlsm',
  'xlsb',
  'xlt',
  'xltx',
  'ppt',
  'pptx',
  'pptm',
  'pot',
  'potx',
  'pps',
  'ppsx',
  'odt',
  'ods',
  'odp',
  'odg',
  'rtf',
  'pages',
  'numbers',
  'key'
])

const PDF_EXT = new Set(['pdf'])

const BINARY_EXT = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'ico',
  'tif',
  'tiff',
  'heic',
  'avif',
  'exe',
  'dll',
  'sys',
  'msi',
  'com',
  'scr',
  'wasm',
  'class',
  'so',
  'dylib',
  'o',
  'a',
  'lib',
  'pdb',
  'zip',
  '7z',
  'rar',
  'gz',
  'tgz',
  'bz2',
  'xz',
  'tar',
  'iso',
  'img',
  'dmg',
  'mp3',
  'wav',
  'flac',
  'ogg',
  'm4a',
  'mp4',
  'mkv',
  'avi',
  'mov',
  'wmv',
  'webm',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'psd',
  'ai',
  'eps',
  'sketch',
  'fig',
  'sqlite',
  'db',
  'mdb',
  'accdb'
])

function startsWith(buf: Uint8Array, magic: number[]): boolean {
  if (buf.length < magic.length) return false
  return magic.every((byte, i) => buf[i] === byte)
}

function hasUtf16Bom(buf: Uint8Array): boolean {
  return startsWith(buf, [0xff, 0xfe]) || startsWith(buf, [0xfe, 0xff])
}

function nulDensity(buf: Uint8Array): number {
  if (buf.length === 0) return 0
  let n = 0
  const limit = Math.min(buf.length, 8192)
  for (let i = 0; i < limit; i++) if (buf[i] === 0) n += 1
  return n / limit
}

function looksLikeUtf16(buf: Uint8Array): boolean {
  if (hasUtf16Bom(buf)) return true
  if (buf.length < 8 || buf.length % 2 !== 0) return false
  return nulDensity(buf) > 0.08
}

export function fileExtension(filePath: string): string {
  const base = filePath.replace(/\\/g, '/').split('/').pop() ?? ''
  const lower = base.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot <= 0) return ''
  return lower.slice(dot + 1)
}

export function unsupportedKindByName(filePath: string): UnsupportedKind | null {
  const ext = fileExtension(filePath)
  if (PDF_EXT.has(ext)) return 'pdf'
  if (OFFICE_EXT.has(ext)) return 'office'
  if (BINARY_EXT.has(ext)) return 'binary'
  return null
}

export function unsupportedKindByBytes(buf: Uint8Array): UnsupportedKind | null {
  if (buf.length === 0) return null
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return 'pdf'
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0])) return 'office'
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buf, [0x50, 0x4b, 0x05, 0x06])) {
    return 'binary'
  }
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) return 'binary'
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'binary'
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return 'binary'
  if (startsWith(buf, [0x4d, 0x5a])) return 'binary'
  if (looksLikeUtf16(buf)) return null
  if (nulDensity(buf) > 0.02) return 'binary'
  return null
}

export function unsupportedOpen(filePath: string, buf: Uint8Array): UnsupportedKind | null {
  return unsupportedKindByName(filePath) ?? unsupportedKindByBytes(buf)
}

export function isUnsupportedOpen(value: unknown): value is UnsupportedOpen {
  return (
    typeof value === 'object' &&
    value !== null &&
    'unsupported' in value &&
    (value as UnsupportedOpen).unsupported === true
  )
}

export function unsupportedKindLabel(kind: UnsupportedKind): string {
  if (kind === 'pdf') return 'PDF'
  if (kind === 'office') return 'Office'
  return 'バイナリ'
}
