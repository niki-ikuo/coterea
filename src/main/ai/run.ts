import { randomUUID } from 'crypto'
import type { WebContents } from 'electron'
import {
  AI_DEFAULT_MODEL,
  aiIsConfigured,
  clampMaxSteps,
  clampMaxTokens,
  clampTemperature,
  parseProposeEditArgs,
  parseProviderId,
  providerById,
  shouldStopAgentLoop,
  type AiProviderId
} from '../../shared/ai'
import type { AiStreamEvent, AiToolRequest } from '../../shared/api'
import type { AppSettings } from '../../shared/types'
import { AGENT_TOOLS, resolveBaseUrl, streamChatCompletion, type LlmMessage } from './openaiCompat'

export type AiRuntime = {
  getSettings: () => AppSettings
  getKey: () => Promise<string | null>
}

const running = new Map<string, AbortController>()
const pendingTools = new Map<string, (result: string) => void>()

export function abortAi(requestId: string): void {
  running.get(requestId)?.abort()
  running.delete(requestId)
}

export function resolveToolResult(requestId: string, callId: string, result: string): void {
  const key = `${requestId}:${callId}`
  const wait = pendingTools.get(key)
  if (wait) {
    pendingTools.delete(key)
    wait(result)
  }
}

export function aiStatusFrom(settings: AppSettings, hasKey: boolean): { hasKey: boolean; configured: boolean } {
  const providerId = parseProviderId(settings.providerId)
  const model = (settings.model ?? AI_DEFAULT_MODEL).trim()
  return { hasKey, configured: aiIsConfigured({ providerId, hasKey, model }) }
}

export async function startAiChat(
  wc: WebContents,
  runtime: AiRuntime,
  req: {
    requestId: string
    mode: 'ask' | 'edit' | 'agent'
    messages: { role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }[]
    activeTabId: string | null
    selection?: { from: number; to: number; text: string } | null
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const settings = runtime.getSettings()
  const providerId = parseProviderId(settings.providerId)
  const model = (settings.model ?? AI_DEFAULT_MODEL).trim()
  const apiKey = ((await runtime.getKey()) ?? '').trim()
  const preset = providerById(providerId)
  if (preset.needsKey && !apiKey) return { ok: false, error: 'API Key が未設定です' }
  if (!model) return { ok: false, error: 'モデル名が空です' }
  const baseUrl = resolveBaseUrl(providerId, settings.apiBaseUrl)
  if (!baseUrl) return { ok: false, error: 'Base URL が空です' }

  abortAi(req.requestId)
  const ac = new AbortController()
  running.set(req.requestId, ac)

  void runLoop(wc, {
    requestId: req.requestId,
    mode: req.mode,
    providerId,
    baseUrl,
    apiKey,
    model,
    temperature: clampTemperature(settings.temperature),
    maxTokens: clampMaxTokens(settings.maxTokens),
    maxSteps: req.mode === 'agent' ? clampMaxSteps(settings.maxAgentSteps) : req.mode === 'edit' ? 2 : 1,
    messages: req.messages,
    activeTabId: req.activeTabId,
    selection: req.selection ?? null,
    signal: ac.signal
  }).finally(() => {
    running.delete(req.requestId)
  })
  return { ok: true }
}

function emit(wc: WebContents, requestId: string, event: AiStreamEvent): void {
  if (wc.isDestroyed()) return
  wc.send('ai:event', { requestId, event })
}

function askTool(wc: WebContents, requestId: string, req: AiToolRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingTools.delete(`${requestId}:${req.callId}`)
      reject(new Error('ツール応答がタイムアウトしました'))
    }, 15_000)
    pendingTools.set(`${requestId}:${req.callId}`, (result) => {
      clearTimeout(timer)
      resolve(result)
    })
    if (wc.isDestroyed()) {
      clearTimeout(timer)
      reject(new Error('ウィンドウが閉じられました'))
      return
    }
    wc.send('ai:tool', { requestId, ...req })
  })
}

async function runLoop(
  wc: WebContents,
  ctx: {
    requestId: string
    mode: 'ask' | 'edit' | 'agent'
    providerId: AiProviderId
    baseUrl: string
    apiKey: string
    model: string
    temperature: number
    maxTokens: number
    maxSteps: number
    messages: { role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }[]
    activeTabId: string | null
    selection: { from: number; to: number; text: string } | null
    signal: AbortSignal
  }
): Promise<void> {
  const tools = ctx.mode === 'ask' ? undefined : AGENT_TOOLS
    const toolChoice =
      ctx.mode === 'edit'
        ? { type: 'function' as const, function: { name: 'propose_edit' } }
        : ctx.mode === 'agent'
          ? ('auto' as const)
          : undefined

  const llmMessages: LlmMessage[] = [
    { role: 'system', content: systemPrompt(ctx.mode, ctx.selection) },
    ...ctx.messages.map((m): LlmMessage => {
      if (m.role === 'tool') {
        return { role: 'tool', content: m.content, tool_call_id: m.toolCallId || 'tool' }
      }
      return { role: m.role, content: m.content }
    })
  ]

  try {
    for (let step = 0; step < ctx.maxSteps; step++) {
      if (ctx.signal.aborted) {
        emit(wc, ctx.requestId, { type: 'error', message: '停止しました' })
        return
      }
      const turn = await streamChatCompletion({
        providerId: ctx.providerId,
        baseUrl: ctx.baseUrl,
        apiKey: ctx.apiKey,
        model: ctx.model,
        temperature: ctx.temperature,
        maxTokens: ctx.maxTokens,
        messages: llmMessages,
        tools,
        toolChoice: ctx.mode === 'edit' && step > 0 ? 'none' : toolChoice,
        signal: ctx.signal,
        onContent: (text) => emit(wc, ctx.requestId, { type: 'delta', text })
      })

      if (turn.content) {
        llmMessages.push({ role: 'assistant', content: turn.content })
      }

      const hasTools = turn.toolCalls.length > 0
      if (shouldStopAgentLoop({ step: step + 1, maxSteps: ctx.maxSteps, aborted: ctx.signal.aborted, hasToolCalls: hasTools })) {
        if (ctx.mode === 'edit' && !hasTools && turn.content) {
          emit(wc, ctx.requestId, {
            type: 'error',
            message: 'このモデルはツール呼び出しに対応していないようです。Agent 非対応の場合は Ask で確認するか、対応モデルに切り替えてください。'
          })
          return
        }
        emit(wc, ctx.requestId, { type: 'done' })
        return
      }

      llmMessages.push({
        role: 'assistant',
        content: turn.content || null,
        tool_calls: turn.toolCalls
      })

      for (const call of turn.toolCalls) {
        const result = await runTool(wc, ctx, call.function.name, call.function.arguments, call.id)
        llmMessages.push({ role: 'tool', content: result, tool_call_id: call.id })
      }

      if (ctx.mode === 'edit') {
        emit(wc, ctx.requestId, { type: 'done' })
        return
      }
    }
    emit(wc, ctx.requestId, { type: 'done' })
  } catch (err) {
    if (ctx.signal.aborted) {
      emit(wc, ctx.requestId, { type: 'error', message: '停止しました' })
      return
    }
    emit(wc, ctx.requestId, { type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

async function runTool(
  wc: WebContents,
  ctx: {
    requestId: string
    activeTabId: string | null
    signal: AbortSignal
  },
  name: string,
  argsJson: string,
  callId: string
): Promise<string> {
  if (name === 'list_open_tabs') {
    emit(wc, ctx.requestId, { type: 'tool', name, detail: '開いているタブを確認' })
    return askTool(wc, ctx.requestId, { callId, name: 'list_open_tabs' })
  }
  if (name === 'read_tab') {
    let tabId = ctx.activeTabId ?? ''
    try {
      const parsed = JSON.parse(argsJson) as { tab_id?: string }
      if (typeof parsed.tab_id === 'string') tabId = parsed.tab_id
    } catch {
      /* use active */
    }
    emit(wc, ctx.requestId, { type: 'tool', name, detail: `タブを読む: ${tabId || '(不明)'}` })
    if (!tabId) return JSON.stringify({ error: 'tab_id がありません' })
    return askTool(wc, ctx.requestId, { callId, name: 'read_tab', tabId })
  }
  if (name === 'propose_edit') {
    let parsedJson: unknown = {}
    try {
      parsedJson = JSON.parse(argsJson) as unknown
    } catch {
      return JSON.stringify({ error: 'JSON を解析できません' })
    }
    const parsed = parseProposeEditArgs(parsedJson, ctx.activeTabId ?? '')
    if ('error' in parsed) return JSON.stringify({ error: parsed.error })
    emit(wc, ctx.requestId, { type: 'tool', name, detail: parsed.note || `変更案: ${parsed.tabId}` })
    const snap = await askTool(wc, ctx.requestId, { callId: `${callId}:snap`, name: 'snapshot_tab', tabId: parsed.tabId })
    let snapshot: { title?: string; content?: string } = {}
    try {
      snapshot = JSON.parse(snap) as { title?: string; content?: string }
    } catch {
      snapshot = {}
    }
    if (snapshot && 'error' in (snapshot as { error?: string })) {
      return snap
    }
    const baseText = typeof snapshot.content === 'string' ? snapshot.content : ''
    const from = parsed.from ?? 0
    const to = parsed.to ?? 0
    const proposal = {
      tabId: parsed.tabId,
      tabTitle: typeof snapshot.title === 'string' ? snapshot.title : '',
      mode: parsed.mode,
      text: parsed.text,
      from: parsed.mode === 'replace_range' ? from : undefined,
      to: parsed.mode === 'replace_range' ? to : undefined,
      baseText,
      rangeBase: parsed.mode === 'replace_range' ? baseText.slice(from, to) : undefined,
      note: parsed.note
    }
    const messageId = randomUUID()
    emit(wc, ctx.requestId, { type: 'proposal', messageId, note: parsed.note, proposal })
    return JSON.stringify({
      ok: true,
      message: '提案をユーザーへ提示しました。未承認のため文書はまだ変わっていません。'
    })
  }
  return JSON.stringify({ error: `未知のツール: ${name}` })
}

function systemPrompt(mode: 'ask' | 'edit' | 'agent', selection: { from: number; to: number; text: string } | null): string {
  const selectHint = selection
    ? `ユーザーは文字オフセット ${selection.from}–${selection.to} を選択しています。Edit では replace_range を優先してください。`
    : '選択範囲はありません。必要ならファイル全体を replace_all してください。'
  if (mode === 'ask') {
    return 'あなたは Coterea の文書アシスタントです。質問に答え、要約や説明をします。文書は変更しません。差分や編集案の適用は提案しないでください。ユーザーの言語に合わせて答えてください。'
  }
  if (mode === 'edit') {
    return `あなたは Coterea の編集アシスタントです。propose_edit をちょうど1回呼び、1つの変更案だけ出します。自分でファイルへ書き込んではいけません。${selectHint} 短い note で何を変えたか説明してください。`
  }
  return `あなたは Coterea の Agent です。開いているタブだけを list_open_tabs / read_tab で読み、変更は propose_edit で提案します。未承認の書き込みはしません。ターミナル・MCP・ディスク探索は禁止です。${selectHint} ユーザーの言語で短く状況を述べてください。`
}
