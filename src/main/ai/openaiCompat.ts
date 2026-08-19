import {
  AI_DEFAULT_MAX_TOKENS,
  AI_DEFAULT_TEMPERATURE,
  completionsUrl,
  providerById,
  type AiProviderId
} from '../../shared/ai'
import {
  choiceDelta,
  mergeToolCallDeltas,
  parseSseBlock,
  parseSseUsage,
  type SseUsage,
  type ToolCallAcc
} from '../../shared/openaiSse'

export type LlmMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls: CompletedToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string }

export type CompletedToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type StreamCallbacks = {
  onContent: (text: string) => void
}

export async function streamChatCompletion(input: {
  providerId: AiProviderId
  baseUrl: string
  apiKey: string
  model: string
  temperature?: number
  maxTokens?: number
  messages: LlmMessage[]
  tools?: unknown
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  signal: AbortSignal
  onContent?: (text: string) => void
}): Promise<{ content: string; toolCalls: CompletedToolCall[]; finishReason: string | null; usage: SseUsage | null }> {
  const url = completionsUrl(input.baseUrl)
  if (!url) throw new Error('API の Base URL が空です')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (input.apiKey) headers.Authorization = `Bearer ${input.apiKey}`
  if (input.providerId === 'openrouter') {
    headers['HTTP-Referer'] = 'https://coterea.app'
    headers['X-Title'] = 'Coterea'
  }
  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    temperature: input.temperature ?? AI_DEFAULT_TEMPERATURE,
    max_tokens: input.maxTokens ?? AI_DEFAULT_MAX_TOKENS,
    stream: true,
    stream_options: { include_usage: true }
  }
  if (input.tools) {
    body.tools = input.tools
    if (input.toolChoice) body.tool_choice = input.toolChoice
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: input.signal
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(httpError(res.status, errText))
  }
  if (!res.body) throw new Error('応答ボディが空です')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let acc: ToolCallAcc[] = []
  let finishReason: string | null = null
  let usage: SseUsage | null = null

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split(/\r?\n\r?\n/)
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      const parsed = parseSseBlock(part)
      if (parsed === 'done' || parsed == null) continue
      const usageDelta = parseSseUsage(parsed)
      if (usageDelta) usage = usageDelta
      const delta = choiceDelta(parsed)
      if (delta.content) {
        content += delta.content
        input.onContent?.(delta.content)
      }
      if (delta.toolCalls.length > 0) acc = mergeToolCallDeltas(acc, delta.toolCalls)
      if (delta.finishReason) finishReason = delta.finishReason
    }
  }

  const toolCalls: CompletedToolCall[] = acc
    .filter((item) => item.name)
    .map((item, i) => ({
      id: item.id || `call_${i}`,
      type: 'function' as const,
      function: { name: item.name, arguments: item.arguments || '{}' }
    }))
  return { content, toolCalls, finishReason, usage }
}

function httpError(status: number, body: string): string {
  const snippet = body.replace(/\s+/g, ' ').trim().slice(0, 240)
  if (status === 401) return 'API Key が拒否されました'
  if (status === 404) return `モデルまたは URL が見つかりません${snippet ? `: ${snippet}` : ''}`
  return `LLM API エラー (${status})${snippet ? `: ${snippet}` : ''}`
}

export function resolveBaseUrl(providerId: AiProviderId, custom: string | undefined): string {
  const preset = providerById(providerId)
  const trimmed = custom?.trim() ?? ''
  if (providerId === 'custom') return trimmed
  return trimmed || preset.baseUrl
}
