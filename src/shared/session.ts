import { isEncodingId, type EncodingId } from './encoding'
import { FILE_SIZE_WARN_BYTES } from './types'

export const SETTINGS_TAB_ID = 'settings'
export const MAX_SESSION_TABS = 48
export const MAX_UNTITLED_CHARS = FILE_SIZE_WARN_BYTES

export type SessionMdView = 'edit' | 'split' | 'preview'

export type SessionTab =
  | {
      kind: 'file'
      path: string
      encoding?: EncodingId
      mdView?: SessionMdView
      mdSplitPct?: number
      mdScrollSync?: boolean
    }
  | { kind: 'untitled'; content: string; encoding?: EncodingId }
  | { kind: 'settings' }

export type EditorSession = {
  tabs: SessionTab[]
  active: number
}

function parseMdView(value: unknown): SessionMdView | undefined {
  if (value === 'edit' || value === 'split' || value === 'preview') return value
  return undefined
}

function parseEncoding(value: unknown): EncodingId | undefined {
  return typeof value === 'string' && isEncodingId(value) ? value : undefined
}

function parseSplitPct(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(75, Math.max(25, value))
}

function parseFileTab(raw: Record<string, unknown>): SessionTab | null {
  if (typeof raw.path !== 'string' || !raw.path.trim()) return null
  return {
    kind: 'file',
    path: raw.path,
    encoding: parseEncoding(raw.encoding),
    mdView: parseMdView(raw.mdView),
    mdSplitPct: parseSplitPct(raw.mdSplitPct),
    mdScrollSync: typeof raw.mdScrollSync === 'boolean' ? raw.mdScrollSync : undefined
  }
}

function parseUntitledTab(raw: Record<string, unknown>): SessionTab | null {
  if (typeof raw.content !== 'string') return null
  return {
    kind: 'untitled',
    content: raw.content.slice(0, MAX_UNTITLED_CHARS),
    encoding: parseEncoding(raw.encoding)
  }
}

export function parseEditorSession(raw: unknown): EditorSession {
  if (!raw || typeof raw !== 'object') return { tabs: [], active: 0 }
  const obj = raw as Record<string, unknown>
  const list = Array.isArray(obj.tabs) ? obj.tabs : []
  const tabs: SessionTab[] = []
  for (const item of list) {
    if (tabs.length >= MAX_SESSION_TABS) break
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    if (rec.kind === 'settings') {
      if (!tabs.some((t) => t.kind === 'settings')) tabs.push({ kind: 'settings' })
      continue
    }
    if (rec.kind === 'help' || rec.kind === 'ai-help') {
      continue
    }
    if (rec.kind === 'untitled') {
      const tab = parseUntitledTab(rec)
      if (tab) tabs.push(tab)
      continue
    }
    if (rec.kind === 'file' || typeof rec.path === 'string') {
      const tab = parseFileTab(rec)
      if (tab) tabs.push(tab)
    }
  }
  const active = typeof obj.active === 'number' && Number.isInteger(obj.active) ? obj.active : 0
  return {
    tabs,
    active: tabs.length === 0 ? 0 : Math.min(Math.max(0, active), tabs.length - 1)
  }
}
