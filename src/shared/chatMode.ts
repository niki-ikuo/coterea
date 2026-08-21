import {
  clampMaxSteps,
  type ChatMessage,
  type ChatMode,
  type ProposedEdit
} from './ai'
import {
  formatOpenTabsCatalog,
  type OpenTabCatalogEntry
} from './aiContext'
import type { ContextCapsule } from './chatContext'

export type { OpenTabCatalogEntry }

export type ActiveFileContext = {
  id: string
  title: string
  language: string
  body: string
}

export type SelectionContext = {
  from: number
  to: number
  text: string
  tabId?: string
  title?: string
  lineFrom?: number
  lineTo?: number
}

export type ChatToolName = 'list_open_tabs' | 'read_tab' | 'propose_edit' | 'update_todo'

export type ChatTabRef = {
  id: string
  title: string
  path?: string | null
}

/** Edit は添付コンテキストの主タブ固定。Agent は指定タブ、なければ主タブ。 */
export function resolveProposeTabId(input: {
  mode: ChatMode
  requested: string
  activeTabId: string | null
}): string | null {
  if (input.mode === 'edit') return input.activeTabId
  return input.requested || input.activeTabId
}

/** 開いているタブを id / パス / 一意のタイトルで探す。 */
export function resolveOpenTabId(input: {
  requested?: string
  tabs: ChatTabRef[]
  activeTabId: string | null
  fallbackToActive: boolean
}): string | undefined {
  const requested = input.requested?.trim()
  if (requested) {
    const exact = input.tabs.find((t) => t.id === requested)
    if (exact) return exact.id
    const byPath = input.tabs.find((t) => t.path === requested)
    if (byPath) return byPath.id
    const titled = input.tabs.filter((t) => t.title === requested)
    if (titled.length === 1) return titled[0].id
    if (!input.fallbackToActive) return undefined
  }
  if (input.activeTabId && input.tabs.some((t) => t.id === input.activeTabId)) return input.activeTabId
  return undefined
}

export type ChatModeUi = {
  id: ChatMode
  label: string
  title: string
  placeholder: string
  summary: string
}

/** 送信モードの表示と、ユーザー向けの動き。処理方針は下の関数群が正。 */
export const CHAT_MODES: ChatModeUi[] = [
  {
    id: 'ask',
    label: 'Ask',
    title: 'このメッセージを Ask モードで送信（質問への回答のみ。文書は変わりません）',
    placeholder: '文書について質問する... (Enterで送信, Shift+Enterで改行)',
    summary: '添付またはいまのファイルについて説明するだけ（文書は変わりません）'
  },
  {
    id: 'edit',
    label: 'Edit',
    title: 'このメッセージを Edit モードで送信（添付またはいまのファイルへの変更案を1つ提案）',
    placeholder: '文書の執筆・修正・整理を依頼... (Enterで送信, Shift+Enterで改行)',
    summary: '添付またはいまのファイルへの変更案を1つ出す'
  },
  {
    id: 'agent',
    label: 'Agent',
    title: 'このメッセージを Agent モードで送信（添付またはカレントタブを読み、他はツールで調査・変更を提案）',
    placeholder: '文書を調査・説明... (Enterで送信, Shift+Enterで改行)',
    summary: '添付またはカレントを渡し、他タブは一覧と read_tab で読む'
  }
]

export function chatModeUi(mode: ChatMode): ChatModeUi {
  return CHAT_MODES.find((item) => item.id === mode) ?? CHAT_MODES[0]
}

/** Ask / Edit は常にファイル本文を載せる。Agent も対象ファイルがあれば本文を載せる。 */
export function includesActiveFileBody(mode: ChatMode, hasAttachedFiles = true): boolean {
  if (mode === 'agent') return hasAttachedFiles
  return true
}

/**
 * カプセルが無いときの本文対象タブ。
 * Ask / Edit / Agent ともカレントタブのみ（Agent の他タブは一覧＋ read_tab）。
 */
export function defaultContextTabIds(input: {
  mode: ChatMode
  openTabIds: readonly string[]
  activeTabId: string | null
}): string[] {
  void input.mode
  if (input.activeTabId && input.openTabIds.includes(input.activeTabId)) return [input.activeTabId]
  return []
}

export function toolsForMode(mode: ChatMode): readonly ChatToolName[] {
  if (mode === 'ask') return []
  if (mode === 'edit') return ['propose_edit']
  return ['list_open_tabs', 'read_tab', 'propose_edit', 'update_todo']
}

/** Ask / Edit は LLM 1回。Agent だけ設定のステップ上限。 */
export function maxStepsForMode(mode: ChatMode, maxAgentSteps: unknown): number {
  if (mode === 'agent') return clampMaxSteps(maxAgentSteps)
  return 1
}

export function systemPromptFor(mode: ChatMode): string {
  if (mode === 'ask') {
    return [
      'あなたは Coterea の文書アシスタントです。',
      '質問への回答・要約・説明だけをします。文書は変更しません。',
      '差分カードや編集の適用は提案しないでください。',
      'ユーザーの言語に合わせて答えてください。'
    ].join('')
  }
  if (mode === 'edit') {
    return [
      'あなたは Coterea の編集アシスタントです。',
      'propose_edit をちょうど1回呼び、1つの変更案だけ出します。',
      'tab_id は省略してください。対象は添付の主ファイル、なければいまのファイルです。',
      'list_open_tabs や read_tab は使いません。ファイル本文はユーザーメッセージにあります。',
      '自分でファイルへ書き込んではいけません。適用はユーザーが行います。',
      '変更は可能な限り replace_range で最小範囲だけ置換してください。ファイル全体の replace_all は本当に全体が必要なときだけにしてください。',
      'propose_edit の note には、何をどう変えるかを短く書いてください。',
      '提案のあと、ユーザーの言語で「何をしたか／何を変える提案か」を必ず短く文章で報告してください。差分カードだけ出して黙って終わらないでください。'
    ].join('')
  }
  return [
    'あなたは Coterea の Agent です。',
    'ユーザーメッセージの添付／カレント本文と、開いているタブ一覧を優先してください。他タブの全文は最初から載っていません。',
    '足りない本文は list_open_tabs / read_tab で読んでください。長いファイルは read_tab の from / to（文字オフセット）で必要な範囲だけ読んでください。',
    '複数依頼や長めのタスクは、先に update_todo で成果物単位（目安3〜5、上限8）に分割し、順番に進めます。',
    '各 todo を in_progress → done と更新し、pending / in_progress が残る間は終了しないでください。',
    '変更は propose_edit で提案します。tab_id には対象タブの id を指定してください。可能な限り replace_range で変更箇所だけを渡し、replace_all は避けてください。',
    '未承認の書き込みはしません。ターミナル・MCP・ディスク探索は禁止です。',
    '選択範囲が示されていれば、その範囲を優先して検討してください。',
    'ユーザーの言語で短く状況を述べてください。'
  ].join('')
}

export function formatCurrentUserMessage(input: {
  mode: ChatMode
  prompt: string
  files?: ActiveFileContext[]
  selections?: SelectionContext[]
  /** Agent 向け。開いているタブの一覧（本文なし） */
  openTabs?: OpenTabCatalogEntry[]
  /** 単一ファイル互換。files が空のときだけ使う */
  activeFile?: ActiveFileContext | null
  /** 単一選択互換。selections が空のときだけ使う */
  selection?: SelectionContext | null
}): string {
  const files =
    input.files && input.files.length > 0
      ? input.files
      : input.activeFile
        ? [input.activeFile]
        : []
  const selections =
    input.selections && input.selections.length > 0
      ? input.selections
      : input.selection
        ? [input.selection]
        : []
  const openTabs = input.openTabs ?? []

  const parts: string[] = []
  if (includesActiveFileBody(input.mode, files.length > 0)) {
    parts.push(formatAttachedFiles(files, input.mode === 'agent'))
  } else if (input.mode === 'agent' && openTabs.length === 0) {
    parts.push(formatAgentWorkspaceEmpty())
  }
  if (input.mode === 'agent' && openTabs.length > 0) {
    parts.push(formatOpenTabsCatalog(openTabs, new Set(files.map((f) => f.id))))
    parts.push(
      [
        '[補足]',
        '上記に無いタブの本文が必要なら list_open_tabs / read_tab を使ってください。長い場合は from / to で範囲指定してください。'
      ].join('\n')
    )
  }
  for (const selection of selections) {
    const block = formatSelection(input.mode, selection)
    if (block) parts.push(block)
  }
  parts.push(`[ユーザー]\n${input.prompt.trim()}`)
  return parts.join('\n\n')
}

function formatAttachedFiles(files: ActiveFileContext[], includeId: boolean): string {
  if (files.length === 0) return '[添付ファイルはありません]'
  const block = (file: ActiveFileContext, label: string): string => {
    const meta = includeId
      ? `id: ${file.id}\nlanguage: ${file.language}`
      : `language: ${file.language}`
    return `${label}\n${meta}\n\n${file.body}`
  }
  if (files.length === 1) {
    return block(files[0], `[添付ファイル: ${files[0].title}]`)
  }
  return files.map((file, index) => block(file, `[添付ファイル ${index + 1}: ${file.title}]`)).join('\n\n')
}

function formatAgentWorkspaceEmpty(): string {
  return [
    '[作業対象]',
    '添付も開いているファイルもありません。list_open_tabs で確認し、本文は read_tab（必要なら from / to）で読んでください。'
  ].join('\n')
}

function formatSelection(mode: ChatMode, selection: SelectionContext): string | null {
  if (!selection) return null
  const where =
    selection.title || selection.tabId
      ? `（${selection.title || selection.tabId}${
          selection.lineFrom != null && selection.lineTo != null
            ? selection.lineFrom === selection.lineTo
              ? `:${selection.lineFrom}`
              : `:${selection.lineFrom}-${selection.lineTo}`
            : ''
        }）`
      : ''
  const header = `[選択範囲${where}]\n文字オフセット ${selection.from}–${selection.to}`
  if (mode === 'edit') {
    return `${header}\nreplace_range を優先してください。\n${selection.text}`
  }
  if (mode === 'agent') {
    return `${header}\nこの範囲を優先して検討してください。\n${selection.text}`
  }
  return `${header}\n${selection.text}`
}

/**
 * 次ターンの LLM に渡す会話。最新のユーザー発言だけに、その時点の添付コンテキストを載せる。
 * 提案カードは短い要約にして残し、空のプレースホルダやツールログは送らない。
 */
export function buildChatMessages(input: {
  mode: ChatMode
  messages: Pick<ChatMessage, 'role' | 'content' | 'proposal' | 'proposalStatus'>[]
  files?: ActiveFileContext[]
  selections?: SelectionContext[]
  openTabs?: OpenTabCatalogEntry[]
  activeFile?: ActiveFileContext | null
  selection?: SelectionContext | null
}): { role: 'user' | 'assistant'; content: string }[] {
  const turns: { role: 'user' | 'assistant'; content: string }[] = []
  for (const msg of input.messages) {
    const content = historyContent(msg)
    if (!content) continue
    if (msg.role === 'user') turns.push({ role: 'user', content })
    else turns.push({ role: 'assistant', content })
  }
  const lastUser = [...turns].reverse().find((item) => item.role === 'user')
  if (lastUser) {
    lastUser.content = formatCurrentUserMessage({
      mode: input.mode,
      prompt: lastUser.content,
      files: input.files,
      selections: input.selections,
      openTabs: input.openTabs,
      activeFile: input.activeFile,
      selection: input.selection
    })
  }
  return turns
}

function historyContent(msg: Pick<ChatMessage, 'role' | 'content' | 'proposal' | 'proposalStatus'>): string | null {
  if (msg.role === 'tool') return null
  if (msg.proposal) return formatProposalForHistory(msg.proposal, msg.proposalStatus)
  const content = msg.content.trim()
  return content ? content : null
}

function formatProposalForHistory(proposal: ProposedEdit, status: ChatMessage['proposalStatus']): string {
  const state =
    status === 'applied' ? '適用済み' : status === 'rejected' ? '拒否' : status === 'conflict' ? '衝突' : '未適用'
  const scope = proposal.mode === 'replace_range' ? '範囲' : 'ファイル全体'
  const note = proposal.note?.trim() || '変更案'
  return `変更案を提示しました（${state} / ${scope} / ${proposal.tabTitle || proposal.tabId}）: ${note}`
}

export type AgentTurnDecision = 'abort' | 'done' | 'run-tools-and-continue' | 'run-tools-and-stop'

/** Agent の1ステップ終了後。ツールは必ず実行してから、続行か打ち切りかを決める。 */
export function decideAgentTurn(input: {
  step: number
  maxSteps: number
  aborted: boolean
  toolCallCount: number
}): AgentTurnDecision {
  if (input.aborted) return 'abort'
  if (input.toolCallCount <= 0) return 'done'
  if (input.step + 1 >= input.maxSteps) return 'run-tools-and-stop'
  return 'run-tools-and-continue'
}

export function editUnsupportedToolMessage(): string {
  return 'このモデルは編集ツールに対応していないようです。Ask で確認するか、ツール対応のモデルに切り替えてください。'
}

/** Edit: propose_edit 成功後に、変更内容の文章報告を促す。 */
export function formatEditReportNudge(): string {
  return [
    '提案はユーザーに提示済みです。文書はまだ変わっていません（適用はユーザーが行います）。',
    'いま何をどう変える提案をしたか、ユーザーの言語で短く報告してください。',
    'ツールは使わず、文章だけ返してください。'
  ].join('')
}

/**
 * 承認した変更をディスクへ即時保存するか。
 * 単独編集かつ実ファイルがあるときだけ。共同編集中はデバウンス自動保存に任せる。
 */
export function shouldPersistAfterProposalApply(
  collabActive: boolean,
  filePath: string | null | undefined
): boolean {
  return !collabActive && Boolean(filePath)
}

/** 送信時にカプセルから主タブとファイル一覧用の id を取り出す。 */
export function tabIdsForCapsules(capsules: readonly ContextCapsule[]): string[] {
  const ids: string[] = []
  for (const capsule of capsules) {
    if (!ids.includes(capsule.tabId)) ids.push(capsule.tabId)
  }
  return ids
}
