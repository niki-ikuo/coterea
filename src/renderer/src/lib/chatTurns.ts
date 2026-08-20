import type { ChatMessage, ChatMode, ProposalStatus } from '../../../shared/ai'
import type { AgentPlanState } from '../../../shared/agentPlan'

export type ChatUserTurn = {
  kind: 'user'
  message: ChatMessage
}

export type ChatAssistantTurn = {
  kind: 'assistant'
  id: string
  requestMode?: ChatMode
  /** 計画パネル用（最新） */
  plan: AgentPlanState | null
  /** 折りたたみ表示するツール行（計画メッセージは除く） */
  tools: ChatMessage[]
  /** 最終回答テキスト（空のプレースホルダは末尾ストリーム用だけ残す） */
  texts: ChatMessage[]
  /** 適用確認中の変更提案（枠下部） */
  openProposals: ChatMessage[]
  /** 適用／拒否済みの変更結果（ツール折りたたみへ） */
  settledProposals: ChatMessage[]
  isActive: boolean
}

export type ChatTurn = ChatUserTurn | ChatAssistantTurn

function isPlanMessage(msg: ChatMessage): boolean {
  return Boolean(msg.agentPlan)
}

function isProposalMessage(msg: ChatMessage): boolean {
  return Boolean(msg.proposal)
}

function isToolMessage(msg: ChatMessage): boolean {
  return msg.role === 'tool' && !isPlanMessage(msg)
}

function isTextMessage(msg: ChatMessage): boolean {
  return msg.role === 'assistant' && !isProposalMessage(msg) && !isPlanMessage(msg)
}

function proposalStatus(msg: ChatMessage): ProposalStatus {
  return msg.proposalStatus ?? 'pending'
}

export function isOpenProposal(msg: ChatMessage): boolean {
  if (!msg.proposal) return false
  const status = proposalStatus(msg)
  return status === 'pending' || status === 'conflict'
}

export function isSettledProposal(msg: ChatMessage): boolean {
  if (!msg.proposal) return false
  const status = proposalStatus(msg)
  return status === 'applied' || status === 'rejected'
}

/** ユーザー発言と、それに続く AI 応答を1ターンにまとめる。 */
export function groupChatTurns(messages: ChatMessage[], busy: boolean): ChatTurn[] {
  const turns: ChatTurn[] = []
  let i = 0
  while (i < messages.length) {
    const msg = messages[i]
    if (msg.role === 'user') {
      turns.push({ kind: 'user', message: msg })
      i++
      continue
    }

    const start = i
    const batch: ChatMessage[] = []
    while (i < messages.length && messages[i].role !== 'user') {
      batch.push(messages[i])
      i++
    }

    const precedingUser = [...messages.slice(0, start)].reverse().find((m) => m.role === 'user')
    const isActive = busy && i >= messages.length
    turns.push(buildAssistantTurn(batch, precedingUser?.mode, isActive))
  }
  return turns
}

function buildAssistantTurn(
  batch: ChatMessage[],
  requestMode: ChatMode | undefined,
  isActive: boolean
): ChatAssistantTurn {
  const plans = batch.filter(isPlanMessage)
  const plan = plans.length > 0 ? plans[plans.length - 1].agentPlan ?? null : null
  const tools = batch.filter(isToolMessage)
  const proposals = batch.filter(isProposalMessage)
  const openProposals = proposals.filter(isOpenProposal)
  const settledProposals = proposals.filter(isSettledProposal)
  const texts = batch.filter(isTextMessage).filter((m, index, arr) => {
    if (m.content.trim()) return true
    return isActive && index === arr.length - 1
  })

  return {
    kind: 'assistant',
    id: batch[0]?.id ?? 'assistant-turn',
    requestMode,
    plan,
    tools,
    texts,
    openProposals,
    settledProposals,
    isActive
  }
}

export function toolDisplayName(name: string | undefined): string {
  switch (name) {
    case 'list_open_tabs':
      return '開いているタブ'
    case 'read_tab':
      return 'タブを読む'
    case 'propose_edit':
      return '変更案'
    case 'update_todo':
      return 'タスクを更新'
    default:
      return name || 'ツール'
  }
}

export function toolIcon(name: string | undefined): string {
  switch (name) {
    case 'list_open_tabs':
      return '📑'
    case 'read_tab':
      return '📄'
    case 'propose_edit':
      return '✏️'
    case 'update_todo':
      return '☑️'
    default:
      return '🔧'
  }
}

export function proposalResultLabel(status: ProposalStatus | undefined): string {
  if (status === 'applied') return '適用済み'
  if (status === 'rejected') return '拒否'
  if (status === 'conflict') return '衝突'
  return '未適用'
}

/** アクティブなターンで、本文側にストリーム表示が無く待機点が必要なとき。 */
export function turnNeedsBusyEllipsis(turn: ChatAssistantTurn): boolean {
  if (!turn.isActive) return false
  const lastText = turn.texts[turn.texts.length - 1]
  if (lastText && !lastText.proposal) return false
  return true
}
