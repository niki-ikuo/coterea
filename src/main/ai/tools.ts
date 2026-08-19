import { randomUUID } from 'crypto'
import { parseProposeEditArgs, parseToolArgsJson, type ChatMode } from '../../shared/ai'
import type { AiStreamEvent, AiToolRequest } from '../../shared/api'
import { resolveProposeTabId, type ChatToolName } from '../../shared/chatMode'

const LIST_OPEN_TABS = {
  type: 'function',
  function: {
    name: 'list_open_tabs',
    description: 'List tabs currently open. Returns id, name, and language. Does not walk the disk.',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  }
}

const READ_TAB = {
  type: 'function',
  function: {
    name: 'read_tab',
    description: 'Read the current text of an open tab by id.',
    parameters: {
      type: 'object',
      properties: { tab_id: { type: 'string' } },
      required: ['tab_id'],
      additionalProperties: false
    }
  }
}

const PROPOSE_EDIT = {
  type: 'function',
  function: {
    name: 'propose_edit',
    description:
      'Propose a document change. The user must approve it. Omit tab_id to target the current file. Use replace_all for the whole file or replace_range for [from, to) character offsets.',
    parameters: {
      type: 'object',
      properties: {
        tab_id: { type: 'string' },
        mode: { type: 'string', enum: ['replace_all', 'replace_range'] },
        text: { type: 'string' },
        from: { type: 'integer' },
        to: { type: 'integer' },
        note: { type: 'string' }
      },
      required: ['mode', 'text'],
      additionalProperties: false
    }
  }
}

export function schemasForTools(names: readonly ChatToolName[]): unknown[] | undefined {
  if (names.length === 0) return undefined
  const all = { list_open_tabs: LIST_OPEN_TABS, read_tab: READ_TAB, propose_edit: PROPOSE_EDIT }
  return names.map((name) => all[name])
}

export type ToolRuntime = {
  requestId: string
  mode: ChatMode
  activeTabId: string | null
  emit: (event: AiStreamEvent) => void
  askRenderer: (req: AiToolRequest) => Promise<string>
}

export async function executeTool(
  rt: ToolRuntime,
  name: string,
  argsJson: string,
  callId: string
): Promise<string> {
  if (name === 'list_open_tabs') {
    rt.emit({ type: 'tool', name, detail: '開いているタブを確認' })
    return rt.askRenderer({ callId, name: 'list_open_tabs' })
  }
  if (name === 'read_tab') {
    const tabId = readTabId(argsJson) || rt.activeTabId || ''
    rt.emit({ type: 'tool', name, detail: `タブを読む: ${tabId || '(不明)'}` })
    if (!tabId) return JSON.stringify({ error: 'tab_id がありません' })
    return rt.askRenderer({ callId, name: 'read_tab', tabId })
  }
  if (name === 'propose_edit') {
    return proposeEdit(rt, argsJson, callId)
  }
  return JSON.stringify({ error: `未知のツール: ${name}` })
}

function readTabId(argsJson: string): string {
  const parsed = parseToolArgsJson(argsJson) as { tab_id?: string } | null
  return parsed && typeof parsed.tab_id === 'string' ? parsed.tab_id : ''
}

async function proposeEdit(rt: ToolRuntime, argsJson: string, callId: string): Promise<string> {
  if (rt.mode === 'edit' && !rt.activeTabId) {
    return JSON.stringify({ error: '開いているファイルがありません' })
  }
  const parsedJson = parseToolArgsJson(argsJson)
  if (parsedJson == null) return JSON.stringify({ error: 'JSON を解析できません' })
  const parsed = parseProposeEditArgs(parsedJson, rt.activeTabId ?? '')
  if ('error' in parsed) return JSON.stringify({ error: parsed.error })

  const tabId = resolveProposeTabId({
    mode: rt.mode,
    requested: parsed.tabId,
    activeTabId: rt.activeTabId
  })
  if (!tabId) return JSON.stringify({ error: '開いているファイルがありません' })

  rt.emit({ type: 'tool', name: 'propose_edit', detail: parsed.note || `変更案: ${tabId}` })
  const snap = await rt.askRenderer({ callId: `${callId}:snap`, name: 'snapshot_tab', tabId })
  let snapshot: { id?: string; title?: string; content?: string; error?: string } = {}
  try {
    snapshot = JSON.parse(snap) as { id?: string; title?: string; content?: string; error?: string }
  } catch {
    snapshot = {}
  }
  if (snapshot.error) return snap

  const appliedTabId = typeof snapshot.id === 'string' && snapshot.id ? snapshot.id : tabId
  const baseText = typeof snapshot.content === 'string' ? snapshot.content : ''
  const from = parsed.from ?? 0
  const to = parsed.to ?? 0
  rt.emit({
    type: 'proposal',
    messageId: randomUUID(),
    note: parsed.note,
    proposal: {
      tabId: appliedTabId,
      tabTitle: typeof snapshot.title === 'string' ? snapshot.title : '',
      mode: parsed.mode,
      text: parsed.text,
      from: parsed.mode === 'replace_range' ? from : undefined,
      to: parsed.mode === 'replace_range' ? to : undefined,
      baseText,
      rangeBase: parsed.mode === 'replace_range' ? baseText.slice(from, to) : undefined,
      note: parsed.note
    }
  })
  return JSON.stringify({
    ok: true,
    message: '提案をユーザーへ提示しました。未承認のため文書はまだ変わっていません。'
  })
}
