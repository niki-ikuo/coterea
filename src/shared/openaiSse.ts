export function parseSseBlock(block: string): unknown | 'done' | null {
  const dataLines = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
  if (dataLines.length === 0) return null
  const data = dataLines.join('\n')
  if (data === '[DONE]') return 'done'
  try {
    return JSON.parse(data) as unknown
  } catch {
    return null
  }
}

export type ToolCallAcc = { id: string; name: string; arguments: string }

export function mergeToolCallDeltas(
  acc: ToolCallAcc[],
  deltas: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>
): ToolCallAcc[] {
  const next = [...acc]
  for (const delta of deltas) {
    const index = typeof delta.index === 'number' ? delta.index : next.length
    while (next.length <= index) next.push({ id: '', name: '', arguments: '' })
    const slot = next[index]
    if (delta.id) slot.id = delta.id
    if (delta.function?.name) slot.name += delta.function.name
    if (delta.function?.arguments) slot.arguments += delta.function.arguments
  }
  return next
}

export type SseUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export function parseSseUsage(payload: unknown): SseUsage | null {
  if (!payload || typeof payload !== 'object') return null
  const usage = (payload as { usage?: Record<string, unknown> }).usage
  if (!usage || typeof usage !== 'object') return null
  const promptTokens = nonNegNumber(usage.prompt_tokens)
  const completionTokens = nonNegNumber(usage.completion_tokens)
  const totalTokens = nonNegNumber(usage.total_tokens)
  if (promptTokens == null && completionTokens == null && totalTokens == null) return null
  const prompt = promptTokens ?? 0
  const completion = completionTokens ?? 0
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: totalTokens ?? prompt + completion
  }
}

function nonNegNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export function choiceDelta(payload: unknown): {
  content: string
  toolCalls: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>
  finishReason: string | null
} {
  if (!payload || typeof payload !== 'object') {
    return { content: '', toolCalls: [], finishReason: null }
  }
  const choice = (payload as { choices?: Array<Record<string, unknown>> }).choices?.[0]
  if (!choice) return { content: '', toolCalls: [], finishReason: null }
  const delta = (choice.delta ?? choice.message) as Record<string, unknown> | undefined
  const content = typeof delta?.content === 'string' ? delta.content : ''
  const toolCalls = Array.isArray(delta?.tool_calls)
    ? (delta.tool_calls as Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>)
    : []
  const finishReason = typeof choice.finish_reason === 'string' ? choice.finish_reason : null
  return { content, toolCalls, finishReason }
}
