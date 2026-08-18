import { existsSync } from 'fs'
import { readdir, readFile } from 'fs/promises'
import { app } from 'electron'
import { isAbsolute, join, relative, resolve, sep } from 'path'
import {
  normalizeHelpId,
  parseHelpFrontmatter,
  resolveHelpId,
  type HelpDoc,
  type HelpDocMeta,
  type HelpSearchHit
} from '../shared/help'

function resolveHelpBaseRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'helps')
  }

  const candidates = [
    join(process.cwd(), 'helps'),
    join(__dirname, '../../helps'),
    join(app.getAppPath(), 'helps')
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return candidates[0]
}

export function resolveHelpRoot(): string {
  const base = resolveHelpBaseRoot()
  const ja = join(base, 'ja')
  if (existsSync(ja)) return ja
  return base
}

function assertInsideRoot(root: string, target: string): string {
  const resolvedRoot = resolve(root)
  const resolvedTarget = resolve(target)
  const rel = relative(resolvedRoot, resolvedTarget)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Invalid help path')
  }
  return resolvedTarget
}

function titleFromBody(body: string, fallback: string): string {
  const heading = body.match(/^#\s+(.+)$/m)
  return heading?.[1]?.trim() || fallback
}

async function collectMarkdownFiles(dir: string, root: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectMarkdownFiles(full, root, out)
      continue
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      out.push(relative(root, full).split(sep).join('/'))
    }
  }
}

export async function listHelpDocs(): Promise<HelpDocMeta[]> {
  const root = resolveHelpRoot()
  if (!existsSync(root)) return []

  const ids: string[] = []
  await collectMarkdownFiles(root, root, ids)
  ids.sort((a, b) => {
    if (a === 'index.md') return -1
    if (b === 'index.md') return 1
    return a.localeCompare(b)
  })

  const docs: HelpDocMeta[] = []
  for (const id of ids) {
    const doc = await getHelpDoc(id)
    docs.push({
      id: doc.id,
      title: doc.title,
      keywords: doc.keywords,
      category: doc.category,
      related: doc.related,
      commands: doc.commands
    })
  }
  return docs
}

export async function getHelpDoc(id: string): Promise<HelpDoc> {
  const root = resolveHelpRoot()
  const normalized = normalizeHelpId(id)
  if (!normalized.toLowerCase().endsWith('.md') || normalized.includes('\0')) {
    throw new Error('Invalid help path')
  }

  const full = assertInsideRoot(root, join(root, ...normalized.split('/')))
  const raw = await readFile(full, 'utf-8')
  const { meta, body } = parseHelpFrontmatter(raw)
  const fallbackTitle = normalized.replace(/\.md$/i, '').split('/').pop() || normalized

  return {
    id: normalized,
    title: meta.title || titleFromBody(body, fallbackTitle),
    keywords: meta.keywords,
    category: meta.category || '',
    related: meta.related.map((item) => resolveHelpId(normalized, item)),
    commands: meta.commands,
    body
  }
}

function makeSnippet(text: string, query: string): string {
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx < 0) {
    return text.slice(0, 120).replace(/\s+/g, ' ').trim()
  }
  const start = Math.max(0, idx - 40)
  const end = Math.min(text.length, idx + q.length + 60)
  const slice = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${slice}${end < text.length ? '…' : ''}`
}

export async function searchHelpDocs(query: string, limit = 30): Promise<HelpSearchHit[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const docs = await listHelpDocs()
  const hits: HelpSearchHit[] = []

  for (const meta of docs) {
    const doc = await getHelpDoc(meta.id)
    let score = 0
    const titleLower = doc.title.toLowerCase()
    const idLower = doc.id.toLowerCase()
    const bodyLower = doc.body.toLowerCase()

    if (titleLower === q) score += 100
    else if (titleLower.includes(q)) score += 50

    if (idLower.includes(q)) score += 20

    for (const keyword of doc.keywords) {
      const k = keyword.toLowerCase()
      if (k === q) score += 40
      else if (k.includes(q) || q.includes(k)) score += 25
    }

    if (bodyLower.includes(q)) score += 10
    if (score <= 0) continue

    hits.push({
      id: doc.id,
      title: doc.title,
      score,
      snippet: makeSnippet(`${doc.title}\n${doc.keywords.join(' ')}\n${doc.body}`, q)
    })
  }

  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  return hits.slice(0, limit)
}
