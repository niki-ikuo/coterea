export interface HelpDocMeta {
  id: string
  title: string
  keywords: string[]
  category: string
  related: string[]
  commands: string[]
}

export interface HelpDoc extends HelpDocMeta {
  body: string
}

export interface HelpSearchHit {
  id: string
  title: string
  score: number
  snippet: string
}

export interface HelpAskRequest {
  question: string
  currentDocId?: string
}

export interface HelpAskResult {
  answer: string
  sources: Array<{ id: string; title: string }>
  commands: string[]
  error?: string
  cancelled?: boolean
}

export const HELP_COMMAND_IDS = [
  'Open Settings',
  'Open Appearance Settings',
  'Open Provider',
  'Focus Chat'
] as const

export type HelpCommandId = (typeof HELP_COMMAND_IDS)[number]

export function isHelpCommandId(value: string): value is HelpCommandId {
  return (HELP_COMMAND_IDS as readonly string[]).includes(value)
}

export function helpCommandLabel(command: HelpCommandId): string {
  switch (command) {
    case 'Open Settings':
      return '設定を開く'
    case 'Open Appearance Settings':
      return '外観設定を開く'
    case 'Open Provider':
      return 'AI 設定を開く'
    case 'Focus Chat':
      return 'AI パネルを表示'
  }
}

export function normalizeHelpId(id: string): string {
  return id.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '')
}

export function resolveHelpId(fromId: string, href: string): string {
  const raw = href.split('#')[0]?.trim() ?? ''
  if (!raw) return normalizeHelpId(fromId)

  const from = normalizeHelpId(fromId)
  if (!raw.includes('/') && !raw.startsWith('.')) {
    const slash = from.lastIndexOf('/')
    const dir = slash >= 0 ? from.slice(0, slash + 1) : ''
    return normalizeHelpId(dir + raw)
  }

  const fromDir = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : ''
  const parts = [...(fromDir ? fromDir.split('/') : []), ...raw.split('/')]
  const stack: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      stack.pop()
      continue
    }
    stack.push(part)
  }
  return stack.join('/')
}

function parseStringList(block: string): string[] {
  const items: string[] = []
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^\s*-\s+(.+?)\s*$/)
    if (match) items.push(match[1].replace(/^['"]|['"]$/g, ''))
  }
  return items
}

export function parseHelpFrontmatter(raw: string): {
  meta: { title?: string; keywords: string[]; category?: string; related: string[]; commands: string[] }
  body: string
} {
  const normalized = raw.replace(/^\uFEFF/, '')
  const empty: { title?: string; keywords: string[]; category?: string; related: string[]; commands: string[] } = {
    keywords: [],
    related: [],
    commands: []
  }
  if (!normalized.startsWith('---')) {
    return { meta: empty, body: normalized }
  }

  const endMatch = normalized.match(/\r?\n---\r?\n/)
  if (!endMatch || endMatch.index === undefined) {
    return { meta: empty, body: normalized }
  }

  const fm = normalized.slice(3, endMatch.index).replace(/^\r?\n/, '')
  const body = normalized.slice(endMatch.index + endMatch[0].length).replace(/^\r?\n/, '')
  const meta = { ...empty }

  const titleMatch = fm.match(/^title:\s*(.+)$/m)
  if (titleMatch) meta.title = titleMatch[1].trim().replace(/^['"]|['"]$/g, '')

  const categoryMatch = fm.match(/^category:\s*(.+)$/m)
  if (categoryMatch) meta.category = categoryMatch[1].trim().replace(/^['"]|['"]$/g, '')

  const keywordsMatch = fm.match(/^keywords:\r?\n((?:\s*-\s+.+\r?\n?)*)/m)
  if (keywordsMatch) meta.keywords = parseStringList(keywordsMatch[1])

  const relatedMatch = fm.match(/^related:\r?\n((?:\s*-\s+.+\r?\n?)*)/m)
  if (relatedMatch) {
    meta.related = parseStringList(relatedMatch[1]).map((item) => item.replace(/\\/g, '/'))
  }

  const commandsMatch = fm.match(/^commands:\r?\n((?:\s*-\s+.+\r?\n?)*)/m)
  if (commandsMatch) meta.commands = parseStringList(commandsMatch[1])

  return { meta, body }
}

export function pickHelpSourceIds(
  hitIds: string[],
  catalogIds: string[],
  currentDocId?: string,
  limit = 5
): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  const push = (id: string | undefined): void => {
    if (!id) return
    const normalized = normalizeHelpId(id)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    out.push(normalized)
  }

  push(currentDocId)
  for (const id of hitIds) {
    if (out.length >= limit) break
    push(id)
  }
  if (out.length < Math.min(3, limit)) {
    push('index.md')
    for (const id of catalogIds) {
      if (out.length >= limit) break
      push(id)
    }
  }
  return out.slice(0, limit)
}
