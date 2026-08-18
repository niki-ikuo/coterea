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
