import type { WebContents } from 'electron'
import {
  AI_DEFAULT_MODEL,
  aiIsConfigured,
  clampMaxTokens,
  clampTemperature,
  parseProviderId,
  providerById,
  type ChatMode
} from '../../shared/ai'
import type { AiStreamEvent, AiToolRequest } from '../../shared/api'
import {
  decideAgentTurn,
  editUnsupportedToolMessage,
  maxStepsForMode,
  systemPromptFor,
  toolsForMode
} from '../../shared/chatMode'
import type { AppSettings } from '../../shared/types'
import { resolveBaseUrl, streamChatCompletion, type CompletedToolCall, type LlmMessage } from './openaiCompat'
import { executeTool, schemasForTools, type ToolRuntime } from './tools'

export type AiRuntime = {
  getSettings: () => AppSettings
  getKey: () => Promise<string | null>
}

type ChatRun = {
  requestId: string
  mode: ChatMode
  providerId: ReturnType<typeof parseProviderId>
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  maxSteps: number
  messages: { role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }[]
  activeTabId: string | null
  signal: AbortSignal
}

const running = new Map<string, AbortController>()
const pendingTools = new Map<string, { resolve: (result: string) => void; reject: (err: Error) => void }>()

export function abortAi(requestId: string): void {
  running.get(requestId)?.abort()
  running.delete(requestId)
  rejectPendingTools(requestId, '停止しました')
}

export function resolveToolResult(requestId: string, callId: string, result: string): void {
  const wait = pendingTools.get(`${requestId}:${callId}`)
  if (wait) {
    pendingTools.delete(`${requestId}:${callId}`)
    wait.resolve(result)
  }
}

function rejectPendingTools(requestId: string, message: string): void {
  for (const [key, wait] of pendingTools) {
    if (!key.startsWith(`${requestId}:`)) continue
    pendingTools.delete(key)
    wait.reject(new Error(message))
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
    mode: ChatMode
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

  void runChat(wc, {
    requestId: req.requestId,
    mode: req.mode,
    providerId,
    baseUrl,
    apiKey,
    model,
    temperature: clampTemperature(settings.temperature),
    maxTokens: clampMaxTokens(settings.maxTokens),
    maxSteps: maxStepsForMode(req.mode, settings.maxAgentSteps),
    messages: req.messages,
    activeTabId: req.activeTabId,
    signal: ac.signal
  }).finally(() => {
    running.delete(req.requestId)
  })
  return { ok: true }
}

async function runChat(wc: WebContents, ctx: ChatRun): Promise<void> {
  try {
    if (ctx.mode === 'ask') await runAsk(wc, ctx)
    else if (ctx.mode === 'edit') await runEdit(wc, ctx)
    else await runAgent(wc, ctx)
  } catch (err) {
    emit(wc, ctx.requestId, {
      type: 'error',
      message: ctx.signal.aborted ? '停止しました' : err instanceof Error ? err.message : String(err)
    })
  }
}

/** いまのファイルを読んで答えるだけ。ツールなし、1回で終わる。 */
async function runAsk(wc: WebContents, ctx: ChatRun): Promise<void> {
  if (stopped(wc, ctx)) return
  await complete(wc, ctx, { messages: llmMessages(ctx) })
  if (stopped(wc, ctx)) return
  emit(wc, ctx.requestId, { type: 'done' })
}

/** 1回の応答で propose_edit を1つ。失敗したらユーザーへ理由を返す。 */
async function runEdit(wc: WebContents, ctx: ChatRun): Promise<void> {
  if (stopped(wc, ctx)) return
  const turn = await complete(wc, ctx, {
    messages: llmMessages(ctx),
    tools: schemasForTools(toolsForMode('edit')),
    toolChoice: { type: 'function', function: { name: 'propose_edit' } }
  })
  if (stopped(wc, ctx)) return

  const call = turn.toolCalls.find((item) => item.function.name === 'propose_edit')
  if (!call) {
    emit(wc, ctx.requestId, { type: 'error', message: editUnsupportedToolMessage() })
    return
  }

  const result = await runOneTool(wc, ctx, call)
  if (stopped(wc, ctx)) return
  if (toolFailed(result)) {
    emit(wc, ctx.requestId, { type: 'error', message: toolErrorMessage(result) })
    return
  }
  emit(wc, ctx.requestId, { type: 'done' })
}

/** 開いているタブをツールで読み、提案を重ねる。ツールが返らなくなるか上限で止まる。 */
async function runAgent(wc: WebContents, ctx: ChatRun): Promise<void> {
  const messages = llmMessages(ctx)
  const tools = schemasForTools(toolsForMode('agent'))

  for (let step = 0; step < ctx.maxSteps; step++) {
    if (stopped(wc, ctx)) return
    const turn = await complete(wc, ctx, { messages, tools, toolChoice: 'auto' })
    const decision = decideAgentTurn({
      step,
      maxSteps: ctx.maxSteps,
      aborted: ctx.signal.aborted,
      toolCallCount: turn.toolCalls.length
    })
    if (decision === 'abort') {
      emit(wc, ctx.requestId, { type: 'error', message: '停止しました' })
      return
    }
    if (decision === 'done') {
      emit(wc, ctx.requestId, { type: 'done' })
      return
    }

    messages.push({
      role: 'assistant',
      content: turn.content || null,
      tool_calls: turn.toolCalls
    })
    for (const call of turn.toolCalls) {
      const result = await runOneTool(wc, ctx, call)
      messages.push({ role: 'tool', content: result, tool_call_id: call.id })
      if (stopped(wc, ctx)) return
    }
    if (decision === 'run-tools-and-stop') {
      emit(wc, ctx.requestId, { type: 'done' })
      return
    }
  }

  emit(wc, ctx.requestId, { type: 'done' })
}

async function complete(
  wc: WebContents,
  ctx: ChatRun,
  input: {
    messages: LlmMessage[]
    tools?: unknown
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  }
): Promise<{ content: string; toolCalls: CompletedToolCall[] }> {
  return streamChatCompletion({
    providerId: ctx.providerId,
    baseUrl: ctx.baseUrl,
    apiKey: ctx.apiKey,
    model: ctx.model,
    temperature: ctx.temperature,
    maxTokens: ctx.maxTokens,
    messages: input.messages,
    tools: input.tools,
    toolChoice: input.toolChoice,
    signal: ctx.signal,
    onContent: (text) => emit(wc, ctx.requestId, { type: 'delta', text })
  })
}

function llmMessages(ctx: ChatRun): LlmMessage[] {
  return [
    { role: 'system', content: systemPromptFor(ctx.mode) },
    ...ctx.messages.map((m): LlmMessage => {
      if (m.role === 'tool') {
        return { role: 'tool', content: m.content, tool_call_id: m.toolCallId || 'tool' }
      }
      return { role: m.role, content: m.content }
    })
  ]
}

function toolRuntime(wc: WebContents, ctx: ChatRun): ToolRuntime {
  return {
    requestId: ctx.requestId,
    activeTabId: ctx.activeTabId,
    emit: (event) => emit(wc, ctx.requestId, event),
    askRenderer: (req) => askTool(wc, ctx.requestId, req)
  }
}

async function runOneTool(wc: WebContents, ctx: ChatRun, call: CompletedToolCall): Promise<string> {
  return executeTool(toolRuntime(wc, ctx), call.function.name, call.function.arguments, call.id)
}

function toolFailed(result: string): boolean {
  try {
    const parsed = JSON.parse(result) as { error?: unknown }
    return typeof parsed.error === 'string' && parsed.error.length > 0
  } catch {
    return false
  }
}

function toolErrorMessage(result: string): string {
  try {
    const parsed = JSON.parse(result) as { error?: string }
    if (typeof parsed.error === 'string' && parsed.error) return parsed.error
  } catch {
    /* raw */
  }
  return result
}

function stopped(wc: WebContents, ctx: ChatRun): boolean {
  if (!ctx.signal.aborted) return false
  emit(wc, ctx.requestId, { type: 'error', message: '停止しました' })
  return true
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
    pendingTools.set(`${requestId}:${req.callId}`, {
      resolve: (result) => {
        clearTimeout(timer)
        resolve(result)
      },
      reject: (err) => {
        clearTimeout(timer)
        reject(err)
      }
    })
    if (wc.isDestroyed()) {
      pendingTools.delete(`${requestId}:${req.callId}`)
      clearTimeout(timer)
      reject(new Error('ウィンドウが閉じられました'))
      return
    }
    wc.send('ai:tool', { requestId, ...req })
  })
}
