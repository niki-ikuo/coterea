/** Safe http(s) / mailto links only for chat markdown rendering. */
export function isSafeChatHref(href: string | undefined | null): boolean {
  if (!href) return false
  const trimmed = href.trim()
  if (!/^(https?:|mailto:)/i.test(trimmed)) return false
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:'
  } catch {
    return false
  }
}

const CODE_FENCE_REGEX = /```[ \t]*([\w+-]*)[ \t]*\r?\n([\s\S]*?)```/g

export type ChatTextSegment = {
  type: 'text'
  content: string
}

export type ChatCodeSegment = {
  type: 'code'
  language: string
  code: string
  label: string
  meta: string
}

export type ChatSegment = ChatTextSegment | ChatCodeSegment

export function getCodeLabel(language: string, code: string): { label: string; meta: string } {
  const lines = code.split('\n').length
  const langLabel = language.split(':')[0] || 'code'
  return { label: langLabel, meta: `${lines} 行` }
}

export function parseChatSegments(content: string): ChatSegment[] {
  const segments: ChatSegment[] = []
  let lastIndex = 0
  CODE_FENCE_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CODE_FENCE_REGEX.exec(content)) !== null) {
    const before = content.slice(lastIndex, match.index).trim()
    if (before) segments.push({ type: 'text', content: before })
    const language = match[1] || 'plaintext'
    const code = match[2].trimEnd()
    const { label, meta } = getCodeLabel(language, code)
    segments.push({ type: 'code', language, code, label, meta })
    lastIndex = match.index + match[0].length
  }
  const tail = content.slice(lastIndex).trim()
  if (tail) segments.push({ type: 'text', content: tail })
  return segments
}

export function hasOpenCodeFence(content: string): boolean {
  const fences = content.match(/```/g)
  return fences !== null && fences.length % 2 === 1
}

export function splitStreamingContent(content: string): {
  complete: string
  streamingCode: { language: string; code: string } | null
} {
  if (!hasOpenCodeFence(content)) {
    return { complete: content, streamingCode: null }
  }
  const lastFence = content.lastIndexOf('```')
  const complete = content.slice(0, lastFence)
  const after = content.slice(lastFence + 3)
  const newline = after.indexOf('\n')
  const language = newline >= 0 ? after.slice(0, newline).trim() : after.trim()
  const code = newline >= 0 ? after.slice(newline + 1) : ''
  return { complete, streamingCode: { language, code } }
}
