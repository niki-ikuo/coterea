import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../../shared/ai'
import { groupChatTurns, turnNeedsBusyEllipsis } from './chatTurns'

function msg(partial: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'role'>): ChatMessage {
  return {
    content: '',
    createdAt: 1,
    ...partial
  }
}

const proposal = {
  tabId: 'tab-1',
  tabTitle: 'notes.md',
  mode: 'replace_all' as const,
  text: '短い',
  baseText: '長い'
}

describe('groupChatTurns', () => {
  it('ユーザーと AI 応答を1枠にまとめる', () => {
    const messages = [
      msg({ id: 'u1', role: 'user', content: '直して', mode: 'agent' }),
      msg({ id: 't1', role: 'tool', content: '開いた', toolName: 'list_open_tabs' }),
      msg({ id: 'a1', role: 'assistant', content: 'こう直しました' }),
      msg({
        id: 'p1',
        role: 'assistant',
        content: '変更案',
        proposal,
        proposalStatus: 'pending'
      })
    ]
    const turns = groupChatTurns(messages, false)
    expect(turns).toHaveLength(2)
    expect(turns[0].kind).toBe('user')
    expect(turns[1].kind).toBe('assistant')
    if (turns[1].kind !== 'assistant') return
    expect(turns[1].tools).toHaveLength(1)
    expect(turns[1].texts.map((t) => t.content)).toEqual(['こう直しました'])
    expect(turns[1].openProposals).toHaveLength(1)
    expect(turns[1].settledProposals).toHaveLength(0)
    expect(turns[1].requestMode).toBe('agent')
  })

  it('適用済み提案はツール側へ回す', () => {
    const messages = [
      msg({ id: 'u1', role: 'user', content: '直して', mode: 'edit' }),
      msg({ id: 'a1', role: 'assistant', content: '提案します' }),
      msg({
        id: 'p1',
        role: 'assistant',
        content: '変更案',
        proposal,
        proposalStatus: 'applied'
      })
    ]
    const turns = groupChatTurns(messages, false)
    expect(turns[1].kind).toBe('assistant')
    if (turns[1].kind !== 'assistant') return
    expect(turns[1].openProposals).toHaveLength(0)
    expect(turns[1].settledProposals).toHaveLength(1)
  })

  it('busy 中の空アシスタントは残す', () => {
    const messages = [
      msg({ id: 'u1', role: 'user', content: '質問', mode: 'ask' }),
      msg({ id: 'a1', role: 'assistant', content: '' })
    ]
    const turns = groupChatTurns(messages, true)
    expect(turns[1].kind).toBe('assistant')
    if (turns[1].kind !== 'assistant') return
    expect(turns[1].texts).toHaveLength(1)
    expect(turnNeedsBusyEllipsis(turns[1])).toBe(false)
  })

  it('ツール実行中は待機点が要る', () => {
    const messages = [
      msg({ id: 'u1', role: 'user', content: '調査', mode: 'agent' }),
      msg({ id: 't1', role: 'tool', content: '読んだ', toolName: 'read_tab' })
    ]
    const turns = groupChatTurns(messages, true)
    expect(turns[1].kind).toBe('assistant')
    if (turns[1].kind !== 'assistant') return
    expect(turnNeedsBusyEllipsis(turns[1])).toBe(true)
  })
})
