import { describe, expect, it } from 'vitest'
import { mdHeadings, parseMdSections, sectionAtLine } from './mdSync'

describe('parseMdSections', () => {
  it('ATX 見出しの段落と行を取る', () => {
    const sections = parseMdSections('# 導入\n本文\n## 詳細\n')
    const heads = mdHeadings(sections)
    expect(heads).toEqual([
      { index: 1, line: 1, level: 1, title: '導入' },
      { index: 2, line: 3, level: 2, title: '詳細' }
    ])
    expect(sectionAtLine(sections, 4)).toBe(2)
  })

  it('コードフェンス内の # は見出しにしない', () => {
    const heads = mdHeadings(parseMdSections('```\n# 偽\n```\n# 本物\n'))
    expect(heads.map((h) => h.title)).toEqual(['本物'])
  })
})
