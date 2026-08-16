export const DEFAULT_ENCODING = 'utf8' as const

export const ENCODINGS = [
  { id: 'utf8', label: 'UTF-8', iconv: 'utf8' },
  { id: 'utf8-bom', label: 'UTF-8 BOM', iconv: 'utf8' },
  { id: 'utf16le', label: 'UTF-16 LE', iconv: 'utf16le' },
  { id: 'utf16be', label: 'UTF-16 BE', iconv: 'utf16be' },
  { id: 'shiftjis', label: 'Shift_JIS (CP932)', iconv: 'cp932' },
  { id: 'eucjp', label: 'EUC-JP', iconv: 'eucjp' },
  { id: 'iso2022jp', label: 'ISO-2022-JP', iconv: 'iso2022jp' },
  { id: 'latin1', label: 'ISO-8859-1', iconv: 'latin1' },
  { id: 'windows1252', label: 'Windows-1252', iconv: 'windows1252' }
] as const

export type EncodingId = (typeof ENCODINGS)[number]['id']

export function isEncodingId(value: string): value is EncodingId {
  return ENCODINGS.some((item) => item.id === value)
}

export function encodingLabel(id: EncodingId): string {
  return ENCODINGS.find((item) => item.id === id)?.label ?? id
}

export function iconvName(id: EncodingId): string {
  return ENCODINGS.find((item) => item.id === id)?.iconv ?? 'utf8'
}
