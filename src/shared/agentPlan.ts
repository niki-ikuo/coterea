/** Agent のタスク分割（update_todo）— Compass の計画レイヤに相当。 */

export type AgentTodoStatus = 'pending' | 'in_progress' | 'done' | 'cancelled'

export interface AgentTodoItem {
  id: string
  content: string
  status: AgentTodoStatus
}

export interface AgentPlanState {
  todos: AgentTodoItem[]
}

/** チェックリストのハード上限。 */
const MAX_TODOS = 8
/** 成果物単位の目安上限（これ超えるとまとめ直しを促す）。 */
export const PREFERRED_PLAN_ACTIVE_TODO_MAX = 5
const MAX_TODO_CONTENT_CHARS = 400

const VALID_STATUSES = new Set<AgentTodoStatus>(['pending', 'in_progress', 'done', 'cancelled'])

export function createAgentPlanState(): AgentPlanState {
  return { todos: [] }
}

function normalizeStatus(raw: unknown): AgentTodoStatus | null {
  if (typeof raw !== 'string') return null
  const status = raw.trim().toLowerCase() as AgentTodoStatus
  return VALID_STATUSES.has(status) ? status : null
}

function normalizeTodoItem(item: unknown): AgentTodoItem | null {
  if (!item || typeof item !== 'object') return null
  const raw = item as Partial<AgentTodoItem>
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const content = typeof raw.content === 'string' ? raw.content.trim() : ''
  const status = normalizeStatus(raw.status)
  if (!id || !content || !status) return null
  return {
    id: id.slice(0, 80),
    content: content.slice(0, MAX_TODO_CONTENT_CHARS),
    status
  }
}

export function applyUpdateTodo(
  state: AgentPlanState,
  args: Record<string, unknown>
): { ok: boolean; summary: string; content: string } {
  const rawTodos = args.todos
  if (!Array.isArray(rawTodos) || rawTodos.length === 0) {
    return {
      ok: false,
      summary: 'todos は空でない配列が必要です',
      content: 'Error: todos must be a non-empty array of { id, content, status }'
    }
  }

  const merge = args.merge === true
  const incoming: AgentTodoItem[] = []
  for (const item of rawTodos) {
    const normalized = normalizeTodoItem(item)
    if (normalized) incoming.push(normalized)
  }

  if (incoming.length === 0) {
    return {
      ok: false,
      summary: '有効な todo がありません',
      content:
        'Error: no valid todos. Each item needs id (string), content (string), status (pending|in_progress|done|cancelled).'
    }
  }

  let truncated = false
  if (merge) {
    const byId = new Map(state.todos.map((t) => [t.id, t]))
    for (const item of incoming) byId.set(item.id, item)
    const merged = [...byId.values()]
    if (merged.length > MAX_TODOS) {
      truncated = true
      state.todos = merged.slice(0, MAX_TODOS)
    } else {
      state.todos = merged
    }
  } else if (incoming.length > MAX_TODOS) {
    truncated = true
    state.todos = incoming.slice(0, MAX_TODOS)
  } else {
    state.todos = incoming
  }

  const rendered = formatTodosList(state.todos)
  const done = state.todos.filter((t) => t.status === 'done').length
  const open = state.todos.filter((t) => t.status === 'pending' || t.status === 'in_progress').length
  const truncateNote = truncated
    ? `\n\nNote: checklist capped at ${MAX_TODOS} items (prefer about 3–${PREFERRED_PLAN_ACTIVE_TODO_MAX} outcome-level items).`
    : ''
  return {
    ok: true,
    summary: truncated
      ? `Todos updated (${done} done, ${open} open, ${state.todos.length} total; capped at ${MAX_TODOS})`
      : `Todos updated (${done} done, ${open} open, ${state.todos.length} total)`,
    content: `Todo list:\n${rendered}${truncateNote}`
  }
}

export function formatTodosList(todos: AgentTodoItem[]): string {
  if (todos.length === 0) return '(empty)'
  return todos
    .map((t) => {
      const mark = t.status === 'done' ? '[x]' : t.status === 'cancelled' ? '[-]' : '[ ]'
      const progress = t.status === 'in_progress' ? ' (in_progress)' : ''
      return `- ${mark} ${t.id}: ${t.content}${progress}`
    })
    .join('\n')
}

export function getOpenTodos(state: AgentPlanState): AgentTodoItem[] {
  return state.todos.filter((t) => t.status === 'pending' || t.status === 'in_progress')
}

export function countOpenTodos(state: AgentPlanState): number {
  return getOpenTodos(state).length
}

export function countActiveTodos(state: AgentPlanState): number {
  return state.todos.filter((item) => item.status !== 'cancelled').length
}

/** 複数依頼・長めのタスクに見えるか（計画のソフト促し用）。 */
export function looksLikeMultiPartAgentTask(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  const listItems = trimmed.match(/^\s*(?:\d+[\.\)]|[-*•])\s+\S/gm)
  if (listItems && listItems.length >= 2) return true

  const jaClauses = trimmed.match(
    /(?:してください|してほしい|して下さい|てください)|(?:修正|変更|追加|削除|作成|実装|更新|書き換え|確認|調査|対応|整理|揃え|短く)して/g
  )
  if (jaClauses && jaClauses.length >= 2 && trimmed.length >= 24) return true

  if (
    trimmed.length >= 12 &&
    /(?:修正|変更|追加|削除|作成|実装|更新|確認|調査|対応|直す|直)[^。\n]{0,20}(?:と|や|および|／|\/)[^。\n]{0,20}(?:修正|変更|追加|削除|作成|実装|更新|確認|調査|テスト|型|ドキュメント|直)/.test(
      trimmed
    )
  ) {
    return true
  }

  const pathLike = trimmed.match(/\b[\w.-]+\.\w{1,12}\b/g)
  if (pathLike && pathLike.length >= 2 && trimmed.length >= 18) return true

  const enVerbs = trimmed.match(
    /\b(?:fix|add|update|create|implement|remove|delete|refactor|write|change|rename|patch)\b/gi
  )
  if (enVerbs && enVerbs.length >= 2 && trimmed.length >= 24) return true

  if (trimmed.length >= 60) {
    const connectors =
      /また、|および|かつ、|さらに、|あと、|加えて|それから|次に|and also|additionally|as well as|then also|;\s*/i
    if (connectors.test(trimmed)) return true
  }

  if (trimmed.length >= 400) {
    const paragraphs = trimmed.split(/\n\s*\n/).filter((p) => p.trim().length > 40)
    if (paragraphs.length >= 2) return true
  }

  return false
}

function looksLikeQuestionAboutChanges(text: string): boolean {
  return /(?:どう(?:やって)?(?:修正|変更|直|書|実装)|(?:修正|変更|実装|対応)(?:方法|方針|手順|理由)|(?:について)?(?:教えて|説明して|解説して)|なぜ|どうして|何が原因)|(?:how\s+(?:do|should|can|would|to)\s+(?:i\s+)?(?:fix|change|update|edit)|(?:explain|describe|advise)\b.{0,40}\b(?:fix|change|update)|what\s+(?:should|would|does)\b.{0,40}\b(?:fix|change)|why\s+(?:is|does|did|should))/i.test(
    text.trim()
  )
}

function looksLikeWorkspaceChangeRequest(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (looksLikeQuestionAboutChanges(trimmed)) return false

  const hasJaImperative =
    /(?:修正|変更|追加|削除|作成|実装|更新|書き換え|リファクタ|追記|置き換)(?:して|してください|してほしい|して下さい)|(?:直して|直す|書いて|書き換|消して|作って|入れて|なおして)/.test(
      trimmed
    )
  const hasEnImperative =
    /(?:please\s+)?(?:fix|change|add|delete|remove|create|implement|update|refactor|write|edit|patch|rename|replace)\b/i.test(
      trimmed
    )
  if (!hasJaImperative && !hasEnImperative) return false

  const hasTargetCue =
    /(?:\.\w{1,12}\b|[/\\]|ファイル|コード|関数|メソッド|コンポーネント|\bfile\b|\bcode\b)/i.test(trimmed)
  const hasPoliteAsk = /(?:してください|してほしい|して下さい|お願い|please\b)/i.test(trimmed)
  if (hasTargetCue || hasPoliteAsk) return true
  return trimmed.length <= 40
}

/** 非自明な変更依頼は先にチェックリストを作らせる。 */
export function shouldPlanFirstAgentTask(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (looksLikeQuestionAboutChanges(trimmed)) return false
  if (looksLikeMultiPartAgentTask(trimmed)) return true
  if (!looksLikeWorkspaceChangeRequest(trimmed)) return false

  const pathOrMention = (trimmed.match(/\b[\w.-]+\.\w{1,12}\b/g) ?? []).length
  if (pathOrMention >= 2) return true
  if (trimmed.length < 36) return false

  const hasTargetCue =
    /(?:\.\w{1,12}\b|[/\\]|ファイル|コード|関数|メソッド|コンポーネント|\bfile\b|\bcode\b)/i.test(trimmed)
  const hasDetail = trimmed.length >= 60 || /\n/.test(trimmed)
  return hasTargetCue || hasDetail
}

export function formatInitialTodoPlanNudge(): string {
  return [
    '[Agent] 複数依頼または長めのタスクに見えます。',
    '先に update_todo で計画してください。目安は 3〜5 項目（上限 8）。',
    '各 todo は「届けたい成果物／検証可能な完了条件」単位にし、次を避けてください:',
    '- 調査 / 実装 / テスト のような粗いフェーズ名だけ',
    '- 手続きステップへの過剰分割（ターンが増えます）',
    '調査が必要な項目は「何を確かめるか」まで書き、実装項目は「どの成果物／挙動」まで書いてください。',
    'todo の status を最新に保ち、調査で前提が変わったら merge=true で計画を更新して構いません。',
    '関連するファイル変更はまとめて propose_edit してよく、無関係な作業は分けてください。',
    'pending / in_progress の todo が残っている間は終了しないでください。'
  ].join('\n')
}

export function formatOversizedTodoPlanNudge(todoCount: number): string {
  return [
    `[Agent] 計画が細かすぎます（${Math.max(0, todoCount)}件）。`,
    '関連する手順をまとめ、成果物ベースで 3〜5 件程度に update_todo し直してください（上限 8）。',
    '「調査」「実装」「テスト」だけの項目名や、1ファイル読み取り単位の分割は避けてください。',
    'すでに十分短い計画なら、そのまま作業を進めて構いません。'
  ].join('\n')
}

export function shouldNudgeMissingTodoPlan(options: {
  userText: string
  openTodoCount: number
  updateTodoCalledThisRun: boolean
  alreadyNudging: boolean
}): boolean {
  if (options.openTodoCount > 0) return false
  if (options.updateTodoCalledThisRun) return false
  if (options.alreadyNudging) return true
  return shouldPlanFirstAgentTask(options.userText)
}

export function shouldNudgeOversizedTodoPlan(options: {
  activeTodoCount: number
  updateTodoCalledThisRun: boolean
  alreadyNudging: boolean
}): boolean {
  if (!options.updateTodoCalledThisRun) return false
  if (options.activeTodoCount <= PREFERRED_PLAN_ACTIVE_TODO_MAX) return false
  if (options.alreadyNudging) return true
  return true
}

export function formatOpenTodosNudge(state: AgentPlanState): string | null {
  const open = getOpenTodos(state)
  if (open.length === 0) return null
  return [
    '[Agent] 未完了の todo が残っています。まだ終了しないでください。',
    '各項目が done または cancelled になるまでツールで続け、進捗に応じて update_todo を呼んでください。',
    '未完了がなくなってからテキストで終了してください。',
    '',
    `未完了の todo (${open.length}):`,
    formatTodosList(open)
  ].join('\n')
}

/** 粗いフェーズ名だけの todo か（UI ヒント用）。 */
export function looksLikeVaguePhaseTodo(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed) return true
  if (/(?:\.\w{1,12}\b|[/\\]|`[^`]+`|[A-Za-z][\w.-]*\.(?:ts|tsx|js|jsx|md|css|json)\b)/i.test(trimmed)) {
    return false
  }
  if (trimmed.length > 36) return false
  return (
    /^(?:調査|実装|テスト|検証|確認|修正|変更|対応|設計|レビュー|分析|調査する|実装する|テストする|検証する)(?:する|します|をおこなう|を行う)?[.。！!]?$/i.test(
      trimmed
    ) ||
    /^(?:investigate|implement(?:ation)?|test(?:ing)?|verify|verification|fix|change|review|design|analyze|analysis|plan)(?:\s+(?:it|code|the\s+code|files?|changes?))?[.!]?\s*$/i.test(
      trimmed
    )
  )
}

export function shouldHintCoarseAgentPlan(plan: AgentPlanState): boolean {
  if (countOpenTodos(plan) === 0) return false
  const active = plan.todos.filter((item) => item.status !== 'cancelled')
  if (active.length === 0) return false
  const vagueCount = active.filter((item) => looksLikeVaguePhaseTodo(item.content)).length
  if (vagueCount === 0) return false
  if (vagueCount === active.length) return true
  return vagueCount >= 2 && vagueCount >= Math.ceil(active.length * 0.6)
}

export function shouldShowAgentPlanPanel(plan: AgentPlanState): boolean {
  return plan.todos.length > 0
}

/** フォーマット済みユーザーメッセージから、生の依頼文だけ取り出す。 */
export function extractUserPrompt(formatted: string): string {
  const match = formatted.match(/\[ユーザー\]\n([\s\S]*)$/)
  return match ? match[1].trim() : formatted.trim()
}

export function sanitizeAgentPlan(raw: unknown): AgentPlanState | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const data = raw as { todos?: unknown }
  if (!Array.isArray(data.todos)) return undefined
  const todos: AgentTodoItem[] = []
  for (const item of data.todos) {
    const normalized = normalizeTodoItem(item)
    if (normalized) todos.push(normalized)
  }
  if (todos.length === 0) return undefined
  return { todos: todos.slice(0, MAX_TODOS) }
}
