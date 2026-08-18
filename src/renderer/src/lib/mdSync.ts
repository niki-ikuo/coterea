export type MdSection = {
  index: number
  line: number
  level: number
  title: string
}

export function parseMdSections(source: string): MdSection[] {
  const lines = source.split(/\r?\n/)
  const sections: MdSection[] = [{ index: 0, line: 1, level: 0, title: '' }]
  let headingIndex = 1
  let inFence = false
  let fenceChar = ''
  let fenceLen = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = line.match(/^(\s{0,3})([`~]{3,})(.*)$/)
    if (fence) {
      const mark = fence[2][0]
      const len = fence[2].length
      if (!inFence) {
        inFence = true
        fenceChar = mark
        fenceLen = len
      } else if (mark === fenceChar && len >= fenceLen && fence[3].trim() === '') {
        inFence = false
      }
      continue
    }
    if (inFence) continue

    const atx = line.match(/^\s{0,3}(#{1,6})\s+(\S.*)$/)
    if (atx) {
      sections.push({
        index: headingIndex,
        line: i + 1,
        level: atx[1].length,
        title: atx[2].replace(/\s+#+\s*$/, '').trim()
      })
      headingIndex += 1
      continue
    }

    const next = lines[i + 1]
    if (next && line.trim() !== '' && /^\s{0,3}(?:=+|-{2,})\s*$/.test(next)) {
      sections.push({
        index: headingIndex,
        line: i + 1,
        level: /^\s{0,3}=+/.test(next) ? 1 : 2,
        title: line.trim()
      })
      headingIndex += 1
      i += 1
    }
  }
  return sections
}

export function mdHeadings(sections: MdSection[]): MdSection[] {
  return sections.filter((item) => item.level > 0)
}

export function sectionAtLine(sections: MdSection[], line: number): number {
  let index = 0
  for (const section of sections) {
    if (section.line <= line) index = section.index
    else break
  }
  return index
}

export function lineOfSection(sections: MdSection[], index: number): number {
  const found = sections.find((section) => section.index === index)
  return found?.line ?? 1
}
