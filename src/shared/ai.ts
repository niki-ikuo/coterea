export const AI_DEFAULT_MODEL = 'gpt-4o-mini'
export const AI_DEFAULT_TEMPERATURE = 0.2
export const AI_DEFAULT_MAX_TOKENS = 8192
export const AI_DEFAULT_MAX_STEPS = 12

export type ChatMode = 'ask' | 'edit' | 'agent'

export type AiProviderId =
  | 'openai'
  | 'gemini'
  | 'deepseek'
  | 'groq'
  | 'openrouter'
  | 'ollama'
  | 'custom'

export type ProposalMode = 'replace_all' | 'replace_range'
export type ProposalStatus = 'pending' | 'applied' | 'rejected' | 'conflict'

export interface AiProviderPreset {
  id: AiProviderId
  label: string
  baseUrl: string
  models: string[]
  needsKey: boolean
  /** 接続検証前。カスタム Base URL 以外はβ。 */
  beta?: boolean
}

export const AI_PROVIDERS: AiProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
    needsKey: true,
    beta: true
  },
  {
    id: 'gemini',
    label: 'Gemini (OpenAI 互換)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.0-flash', 'gemini-2.5-flash'],
    needsKey: true,
    beta: true
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    needsKey: true,
    beta: true
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    needsKey: true,
    beta: true
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o-mini', 'google/gemini-2.0-flash-001'],
    needsKey: true,
    beta: true
  },
  {
    id: 'ollama',
    label: 'Ollama（ローカル）',
    baseUrl: 'http://127.0.0.1:11434/v1',
    models: ['llama3.2', 'qwen2.5'],
    needsKey: false,
    beta: true
  },
  {
    id: 'custom',
    label: 'カスタム Base URL',
    baseUrl: '',
    models: [AI_DEFAULT_MODEL],
    needsKey: true
  }
]

export interface ProposedEdit {
  tabId: string
  tabTitle: string
  mode: ProposalMode
  text: string
  from?: number
  to?: number
  baseText: string
  rangeBase?: string
  note?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  createdAt: number
  mode?: ChatMode
  toolName?: string
  proposal?: ProposedEdit
  proposalStatus?: ProposalStatus
}

export interface ChatThread {
  id: string
  title: string
  mode: ChatMode
  messages: ChatMessage[]
  draft?: string
  updatedAt: number
  /** false のときタブからは外し、履歴一覧から再開できる */
  open?: boolean
}

export interface ChatHistoryFile {
  activeId: string
  threads: ChatThread[]
}

export interface AiSettingsPatch {
  providerId?: AiProviderId
  apiBaseUrl?: string
  model?: string
  temperature?: number
  maxTokens?: number
  maxAgentSteps?: number
}

export function providerById(id: string | undefined): AiProviderPreset {
  return AI_PROVIDERS.find((item) => item.id === id) ?? AI_PROVIDERS[0]
}

export function parseProviderId(raw: unknown): AiProviderId {
  return AI_PROVIDERS.some((item) => item.id === raw) ? (raw as AiProviderId) : 'openai'
}

export function clampTemperature(value: unknown, fallback = AI_DEFAULT_TEMPERATURE): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(2, Math.max(0, n))
}

export function clampMaxTokens(value: unknown, fallback = AI_DEFAULT_MAX_TOKENS): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n < 16) return fallback
  return Math.min(128_000, n)
}

export function clampMaxSteps(value: unknown, fallback = AI_DEFAULT_MAX_STEPS): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n < 1) return fallback
  return Math.min(32, n)
}

export function completionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed
  return `${trimmed}/chat/completions`
}

export function titleFromPrompt(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  if (!line) return '新しい会話'
  return line.length > 28 ? `${line.slice(0, 28)}…` : line
}

export function emptyThread(id: string, now = Date.now()): ChatThread {
  return {
    id,
    title: '新しい会話',
    mode: 'ask',
    messages: [],
    draft: '',
    updatedAt: now,
    open: true
  }
}

export function isThreadOpen(thread: Pick<ChatThread, 'open'>): boolean {
  return thread.open !== false
}

export function openChatThreads(threads: ChatThread[]): ChatThread[] {
  return threads.filter(isThreadOpen)
}

export function historyChatThreads(threads: ChatThread[]): ChatThread[] {
  return [...threads]
    .filter((t) => t.messages.some((m) => m.role === 'user' || m.content))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function defaultChatHistory(now = Date.now()): ChatHistoryFile {
  const thread = emptyThread('thread-1', now)
  return { activeId: thread.id, threads: [thread] }
}

export function sanitizeChatHistory(raw: unknown): ChatHistoryFile {
  const fallback = defaultChatHistory()
  if (!raw || typeof raw !== 'object') return fallback
  const data = raw as Partial<ChatHistoryFile>
  const threads = Array.isArray(data.threads)
    ? data.threads.map(sanitizeThread).filter((item): item is ChatThread => item !== null)
    : []
  if (threads.length === 0) return fallback
  const activeId =
    typeof data.activeId === 'string' && threads.some((t) => t.id === data.activeId)
      ? data.activeId
      : threads[0].id
  return { activeId, threads }
}

function sanitizeThread(raw: unknown): ChatThread | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<ChatThread>
  if (typeof data.id !== 'string' || !data.id) return null
  const mode = data.mode === 'edit' || data.mode === 'agent' || data.mode === 'ask' ? data.mode : 'ask'
  const messages = Array.isArray(data.messages) ? data.messages.map(sanitizeMessage).filter((m) => m !== null) : []
  return {
    id: data.id,
    title: typeof data.title === 'string' && data.title.trim() ? data.title : '新しい会話',
    mode,
    messages,
    draft: typeof data.draft === 'string' ? data.draft : '',
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
    open: data.open !== false
  }
}

function sanitizeMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<ChatMessage>
  if (typeof data.id !== 'string' || !data.id) return null
  if (data.role !== 'user' && data.role !== 'assistant' && data.role !== 'tool') return null
  return {
    id: data.id,
    role: data.role,
    content: typeof data.content === 'string' ? data.content : '',
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
    mode: data.mode === 'ask' || data.mode === 'edit' || data.mode === 'agent' ? data.mode : undefined,
    toolName: typeof data.toolName === 'string' ? data.toolName : undefined,
    proposal: data.proposal ? sanitizeProposal(data.proposal) : undefined,
    proposalStatus:
      data.proposalStatus === 'pending' ||
      data.proposalStatus === 'applied' ||
      data.proposalStatus === 'rejected' ||
      data.proposalStatus === 'conflict'
        ? data.proposalStatus
        : data.proposal
          ? 'pending'
          : undefined
  }
}

function sanitizeProposal(raw: ProposedEdit): ProposedEdit | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  if (typeof raw.tabId !== 'string' || typeof raw.text !== 'string') return undefined
  const mode = raw.mode === 'replace_range' ? 'replace_range' : 'replace_all'
  return {
    tabId: raw.tabId,
    tabTitle: typeof raw.tabTitle === 'string' ? raw.tabTitle : '',
    mode,
    text: raw.text,
    from: typeof raw.from === 'number' ? raw.from : undefined,
    to: typeof raw.to === 'number' ? raw.to : undefined,
    baseText: typeof raw.baseText === 'string' ? raw.baseText : '',
    rangeBase: typeof raw.rangeBase === 'string' ? raw.rangeBase : undefined,
    note: typeof raw.note === 'string' ? raw.note : undefined
  }
}

export function cannotDeleteLastThread(threadCount: number): boolean {
  return threadCount <= 1
}

export function aiIsConfigured(input: { providerId: AiProviderId; hasKey: boolean; model: string }): boolean {
  const preset = providerById(input.providerId)
  if (!input.model.trim()) return false
  if (!preset.needsKey) return true
  return input.hasKey
}

export interface ProposeEditArgs {
  tabId: string
  mode: ProposalMode
  text: string
  from?: number
  to?: number
  note?: string
}

export function parseProposeEditArgs(raw: unknown, fallbackTabId: string): ProposeEditArgs | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'propose_edit の引数が不正です' }
  const data = raw as Record<string, unknown>
  const tabId = typeof data.tab_id === 'string' && data.tab_id ? data.tab_id : fallbackTabId
  if (!tabId) return { error: 'tab_id がありません' }
  const text = typeof data.text === 'string' ? data.text : null
  if (text == null) return { error: 'text がありません' }
  const mode = data.mode === 'replace_range' ? 'replace_range' : 'replace_all'
  const from = typeof data.from === 'number' ? data.from : undefined
  const to = typeof data.to === 'number' ? data.to : undefined
  if (mode === 'replace_range') {
    if (from == null || to == null || from < 0 || to < from) {
      return { error: 'replace_range には有効な from / to が必要です' }
    }
  }
  return {
    tabId,
    mode,
    text,
    from,
    to,
    note: typeof data.note === 'string' ? data.note : undefined
  }
}

export type ApplyCollision = 'ok' | 'stale' | 'missing' | 'range-mismatch'

export function classifyApplyCollision(input: {
  current: string | null
  proposal: ProposedEdit
}): ApplyCollision {
  if (input.current == null) return 'missing'
  if (input.proposal.mode === 'replace_all') {
    return input.current === input.proposal.baseText ? 'ok' : 'stale'
  }
  const from = input.proposal.from ?? 0
  const to = input.proposal.to ?? 0
  if (from < 0 || to > input.current.length || from > to) return 'range-mismatch'
  const slice = input.current.slice(from, to)
  if (input.proposal.rangeBase != null && slice !== input.proposal.rangeBase) return 'stale'
  return 'ok'
}
