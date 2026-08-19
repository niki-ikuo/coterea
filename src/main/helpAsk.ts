import {
  AI_DEFAULT_MODEL,
  clampMaxTokens,
  clampTemperature,
  parseProviderId,
  providerById
} from '../shared/ai'
import { pickHelpSourceIds, type HelpAskRequest, type HelpAskResult, type HelpDoc } from '../shared/help'
import { getHelpDoc, listHelpDocs, searchHelpDocs } from './help'
import { resolveBaseUrl, streamChatCompletion } from './ai/openaiCompat'
import type { AiRuntime } from './ai/run'

const HELP_ASK_MAX_SOURCES = 5
const HELP_ASK_BODY_CHARS = 4500

let activeHelpAskAbort: AbortController | null = null

export function cancelHelpAsk(): boolean {
  if (!activeHelpAskAbort) return false
  activeHelpAskAbort.abort()
  activeHelpAskAbort = null
  return true
}

function truncateBody(body: string, maxChars: number): string {
  const trimmed = body.trim()
  if (trimmed.length <= maxChars) return trimmed
  return `${trimmed.slice(0, maxChars)}\n…`
}

export async function loadHelpAskSources(question: string, currentDocId?: string): Promise<HelpDoc[]> {
  const [hits, catalog] = await Promise.all([searchHelpDocs(question, 8), listHelpDocs()])
  const ids = pickHelpSourceIds(
    hits.map((hit) => hit.id),
    catalog.map((doc) => doc.id),
    currentDocId,
    HELP_ASK_MAX_SOURCES
  )
  const sources: HelpDoc[] = []
  for (const id of ids) {
    try {
      sources.push(await getHelpDoc(id))
    } catch {
      /* skip missing pages */
    }
  }
  return sources
}

function buildHelpAskMessages(question: string, sources: HelpDoc[]): Array<{ role: 'system' | 'user'; content: string }> {
  const articles = sources
    .map((doc) => {
      const body = truncateBody(doc.body, HELP_ASK_BODY_CHARS)
      return [`### ${doc.id}`, `# ${doc.title}`, body].join('\n')
    })
    .join('\n\n')

  return [
    {
      role: 'system',
      content:
        'あなたは Coterea のオフラインヘルプ担当です。提供されたヘルプ記事だけを根拠に、簡潔で正確に答えてください。記事に無いことは推測で断定せず、「ヘルプに記載がありません」と伝え、近いトピックを案内してください。日本語で回答してください。'
    },
    {
      role: 'user',
      content: ['# ヘルプ記事', '', articles || '（記事なし）', '', '# 質問', question.trim()].join('\n')
    }
  ]
}

function collectCommands(sources: HelpDoc[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const doc of sources) {
    for (const command of doc.commands) {
      if (seen.has(command)) continue
      seen.add(command)
      out.push(command)
    }
  }
  return out
}

export async function askHelp(runtime: AiRuntime, request: HelpAskRequest): Promise<HelpAskResult> {
  cancelHelpAsk()
  const abortController = new AbortController()
  activeHelpAskAbort = abortController
  const { signal } = abortController

  try {
    const question = request.question.trim()
    if (!question) {
      return { answer: '', sources: [], commands: [], error: '質問を入力してください' }
    }

    const settings = runtime.getSettings()
    const providerId = parseProviderId(settings.providerId)
    const model = (settings.model ?? AI_DEFAULT_MODEL).trim()
    const apiKey = ((await runtime.getKey()) ?? '').trim()
    const preset = providerById(providerId)
    if (preset.needsKey && !apiKey) {
      return { answer: '', sources: [], commands: [], error: 'API Key が未設定です' }
    }
    if (!model) {
      return { answer: '', sources: [], commands: [], error: 'モデル名が空です' }
    }
    const baseUrl = resolveBaseUrl(providerId, settings.apiBaseUrl)
    if (!baseUrl) {
      return { answer: '', sources: [], commands: [], error: 'Base URL が空です' }
    }

    const sources = await loadHelpAskSources(question, request.currentDocId)
    if (signal.aborted) return { answer: '', sources: [], commands: [], cancelled: true }

    const result = await streamChatCompletion({
      providerId,
      baseUrl,
      apiKey,
      model,
      temperature: clampTemperature(settings.temperature),
      maxTokens: Math.min(1024, clampMaxTokens(settings.maxTokens)),
      messages: buildHelpAskMessages(question, sources),
      signal
    })

    if (runtime.recordUsage) {
      await runtime.recordUsage(
        result.usage
          ? {
              promptTokens: result.usage.promptTokens,
              completionTokens: result.usage.completionTokens,
              totalTokens: result.usage.totalTokens
            }
          : {}
      )
    }

    if (signal.aborted) return { answer: '', sources: [], commands: [], cancelled: true }

    const listed = sources.map((doc) => ({ id: doc.id, title: doc.title }))
    const commands = collectCommands(sources)
    const answer = result.content.trim()
    if (!answer) {
      return { answer: '', sources: listed, commands, error: '応答が空でした' }
    }
    return { answer, sources: listed, commands }
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return { answer: '', sources: [], commands: [], cancelled: true }
    }
    const message = error instanceof Error ? error.message : String(error)
    return { answer: '', sources: [], commands: [], error: message }
  } finally {
    if (activeHelpAskAbort === abortController) activeHelpAskAbort = null
  }
}
