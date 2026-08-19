import {
  clampMaxSteps,
  type ChatMessage,
  type ChatMode,
  type ProposedEdit
} from './ai'

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
}

export type ChatToolName = 'list_open_tabs' | 'read_tab' | 'propose_edit'

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
    placeholder: 'いまの文書について質問する... (Enterで送信, Shift+Enterで改行)',
    summary: 'いまのファイルについて説明するだけ（文書は変わりません）'
  },
  {
    id: 'edit',
    label: 'Edit',
    title: 'このメッセージを Edit モードで送信（いまのファイルへの変更案を1つ提案）',
    placeholder: 'いまの文書の執筆・修正・整理を依頼... (Enterで送信, Shift+Enterで改行)',
    summary: 'いまのファイルへの変更案を1つ出す'
  },
  {
    id: 'agent',
    label: 'Agent',
    title: 'このメッセージを Agent モードで送信（開いているタブを読んで調査・変更を提案）',
    placeholder: '開いている文書を調査・説明... (Enterで送信, Shift+Enterで改行)',
    summary: '開いているタブをツールで読み、複数の変更案を出せる'
  }
]

export function chatModeUi(mode: ChatMode): ChatModeUi {
  return CHAT_MODES.find((item) => item.id === mode) ?? CHAT_MODES[0]
}

/** Ask / Edit は本文を載せる。Agent はツールで読むので本文は載せない。 */
export function includesActiveFileBody(mode: ChatMode): boolean {
  return mode !== 'agent'
}

export function toolsForMode(mode: ChatMode): readonly ChatToolName[] {
  if (mode === 'ask') return []
  if (mode === 'edit') return ['propose_edit']
  return ['list_open_tabs', 'read_tab', 'propose_edit']
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
      'list_open_tabs や read_tab は使いません。ファイル本文はユーザーメッセージにあります。',
      '自分でファイルへ書き込んではいけません。適用はユーザーが行います。',
      '選択範囲が示されていれば replace_range を優先し、なければ replace_all を使います。',
      '短い note で何を変えたか説明してください。'
    ].join('')
  }
  return [
    'あなたは Coterea の Agent です。',
    '開いているタブだけを list_open_tabs / read_tab で読み、変更は propose_edit で提案します。',
    'ファイル全文はユーザーメッセージに載っていないので、必要なタブは必ず read_tab してください。',
    '未承認の書き込みはしません。ターミナル・MCP・ディスク探索は禁止です。',
    '選択範囲が示されていれば、その範囲を優先して検討してください。',
    'ユーザーの言語で短く状況を述べてください。'
  ].join('')
}

export function formatCurrentUserMessage(input: {
  mode: ChatMode
  prompt: string
  activeFile: ActiveFileContext | null
  selection: SelectionContext | null
}): string {
  const parts: string[] = []
  if (includesActiveFileBody(input.mode)) {
    parts.push(formatAskEditFile(input.activeFile))
  } else {
    parts.push(formatAgentWorkspace(input.activeFile))
  }
  const selection = formatSelection(input.mode, input.selection)
  if (selection) parts.push(selection)
  parts.push(`[ユーザー]\n${input.prompt.trim()}`)
  return parts.join('\n\n')
}

function formatAskEditFile(file: ActiveFileContext | null): string {
  if (!file) return '[開いているファイルはありません]'
  return `[現在のファイル: ${file.title}]\nid: ${file.id}\nlanguage: ${file.language}\n\n${file.body}`
}

function formatAgentWorkspace(file: ActiveFileContext | null): string {
  if (!file) {
    return [
      '[作業対象]',
      '開いているファイルはありません。',
      'タブがあれば list_open_tabs で確認し、本文は read_tab で読んでください。'
    ].join('\n')
  }
  return [
    '[作業対象]',
    `アクティブタブ: ${file.title} (id: ${file.id}, language: ${file.language})`,
    '開いているタブの本文は list_open_tabs / read_tab で読んでください。ファイル全文はここに載せていません。'
  ].join('\n')
}

function formatSelection(mode: ChatMode, selection: SelectionContext | null): string | null {
  if (!selection) return null
  const header = `[選択範囲]\n文字オフセット ${selection.from}–${selection.to}`
  if (mode === 'edit') {
    return `${header}\nreplace_range を優先してください。\n${selection.text}`
  }
  if (mode === 'agent') {
    return `${header}\nこの範囲を優先して検討してください。\n${selection.text}`
  }
  return `${header}\n${selection.text}`
}

/**
 * 次ターンの LLM に渡す会話。最新のユーザー発言だけに、その時点のファイル／作業対象を載せる。
 * 提案カードは短い要約にして残し、空のプレースホルダやツールログは送らない。
 */
export function buildChatMessages(input: {
  mode: ChatMode
  messages: Pick<ChatMessage, 'role' | 'content' | 'proposal' | 'proposalStatus'>[]
  activeFile: ActiveFileContext | null
  selection: SelectionContext | null
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
