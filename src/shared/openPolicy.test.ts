import { describe, expect, it } from 'vitest'
import { unsupportedKindByBytes, unsupportedKindByName, unsupportedOpen } from './openPolicy'

describe('unsupportedKindByName', () => {
  it('PDF を拒否する', () => {
    expect(unsupportedKindByName('C:\\docs\\a.PDF')).toBe('pdf')
  })

  it('Office を拒否する', () => {
    expect(unsupportedKindByName('notes.docx')).toBe('office')
    expect(unsupportedKindByName('sheet.xlsx')).toBe('office')
    expect(unsupportedKindByName('slide.pptx')).toBe('office')
  })

  it('テキストは通す', () => {
    expect(unsupportedKindByName('C:\\work\\a.txt')).toBeNull()
    expect(unsupportedKindByName('README.md')).toBeNull()
    expect(unsupportedKindByName('hosts')).toBeNull()
  })
})

describe('unsupportedKindByBytes', () => {
  it('%PDF を PDF とみなす', () => {
    expect(unsupportedKindByBytes(Buffer.from('%PDF-1.7\n'))).toBe('pdf')
  })

  it('OLE を Office とみなす', () => {
    expect(unsupportedKindByBytes(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe(
      'office'
    )
  })

  it('ZIP / PNG / EXE をバイナリとみなす', () => {
    expect(unsupportedKindByBytes(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe('binary')
    expect(unsupportedKindByBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'binary'
    )
    expect(unsupportedKindByBytes(Buffer.from('MZ'))).toBe('binary')
  })

  it('UTF-16 の NUL はテキストとして通す', () => {
    const bom = Buffer.from([0xff, 0xfe, 0x61, 0x00, 0x62, 0x00])
    expect(unsupportedKindByBytes(bom)).toBeNull()
  })

  it('UTF-8 テキストは通す', () => {
    expect(unsupportedKindByBytes(Buffer.from('hello\n世界\n'))).toBeNull()
  })
})

describe('unsupportedOpen', () => {
  it('拡張子を優先する', () => {
    expect(unsupportedOpen('a.pdf', Buffer.from('not a pdf'))).toBe('pdf')
  })

  it('中身が Office なら拡張子が txt でも拒否する', () => {
    expect(unsupportedOpen('notes.txt', Buffer.from('%PDF-1.4'))).toBe('pdf')
  })
})
