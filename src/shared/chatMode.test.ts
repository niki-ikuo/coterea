import { describe, expect, it } from 'vitest'
import type { ChatMessage } from './ai'
import {
  buildChatMessages,
  decideAgentTurn,
  formatCurrentUserMessage,
  includesActiveFileBody,
  maxStepsForMode,
  systemPromptFor,
  toolsForMode
} from './chatMode'

const file = {
  id: 'tab-1',
  title: 'notes.md',
  language: 'markdown',
  body: '導入を長く書いた。'
}

describe('mode policy', () => {
  it('Ask / Edit は本文を載せ、Agent は載せない', () => {
    expect(includesActiveFileBody('ask')).toBe(true)
    expect(includesActiveFileBody('edit')).toBe(true)
    expect(includesActiveFileBody('agent')).toBe(false)
  })

  it('ツールはモードごとに最小限', () => {
    expect(toolsForMode('ask')).toEqual([])
    expect(toolsForMode('edit')).toEqual(['propose_edit'])
    expect(toolsForMode('agent')).toEqual(['list_open_tabs', 'read_tab', 'propose_edit'])
  })

  it('ステップ数は Agent だけ設定値', () => {
    expect(maxStepsForMode('ask', 12)).toBe(1)
    expect(maxStepsForMode('edit', 12)).toBe(1)
    expect(maxStepsForMode('agent', 12)).toBe(12)
    expect(maxStepsForMode('agent', 0)).toBe(12)
  })
})

describe('formatCurrentUserMessage', () => {
  it('Ask はファイル本文と質問を1通にまとめる', () => {
    const text = formatCurrentUserMessage({
      mode: 'ask',
      prompt: '導入を短くして',
      activeFile: file,
      selection: null
    })
    expect(text).toContain('[現在のファイル: notes.md]')
    expect(text).toContain('導入を長く書いた。')
    expect(text).toContain('[ユーザー]\n導入を短くして')
  })

  it('Agent は本文を載せずアクティブタブの id だけ示す', () => {
    const text = formatCurrentUserMessage({
      mode: 'agent',
      prompt: '全体を整理',
      activeFile: file,
      selection: { from: 0, to: 2, text: '導入' }
    })
    expect(text).toContain('id: tab-1')
    expect(text).not.toContain('導入を長く書いた。')
    expect(text).toContain('read_tab')
    expect(text).toContain('この範囲を優先して検討してください。')
    expect(text).toContain('[ユーザー]\n全体を整理')
  })
})

describe('buildChatMessages', () => {
  it('最新のユーザー発言にだけ今のファイルを載せ、提案は要約する', () => {
    const messages: Pick<ChatMessage, 'role' | 'content' | 'proposal' | 'proposalStatus'>[] = [
      { role: 'user', content: '短くして' },
      {
        role: 'assistant',
        content: '変更案',
        proposalStatus: 'applied',
        proposal: {
          tabId: 'tab-1',
          tabTitle: 'notes.md',
          mode: 'replace_all',
          text: '短い導入。',
          baseText: '導入を長く書いた。',
          note: '導入を圧縮'
        }
      },
      { role: 'user', content: 'もう少しだけ' },
      { role: 'assistant', content: '' },
      { role: 'tool', content: 'タブを読む' }
    ]
    const turns = buildChatMessages({
      mode: 'edit',
      messages,
      activeFile: file,
      selection: null
    })
    expect(turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user'])
    expect(turns[0].content).toBe('短くして')
    expect(turns[1].content).toContain('適用済み')
    expect(turns[1].content).toContain('導入を圧縮')
    expect(turns[2].content).toContain('[ユーザー]\nもう少しだけ')
    expect(turns[2].content).toContain('導入を長く書いた。')
  })
})

describe('systemPromptFor', () => {
  it('Ask は編集ツールに触れない', () => {
    expect(systemPromptFor('ask')).not.toContain('propose_edit')
    expect(systemPromptFor('edit')).toContain('propose_edit をちょうど1回')
    expect(systemPromptFor('agent')).toContain('read_tab')
  })
})

describe('decideAgentTurn', () => {
  it('停止・完了・続行を取り違えない', () => {
    expect(decideAgentTurn({ step: 0, maxSteps: 12, aborted: true, toolCallCount: 2 })).toBe('abort')
    expect(decideAgentTurn({ step: 0, maxSteps: 12, aborted: false, toolCallCount: 0 })).toBe('done')
    expect(decideAgentTurn({ step: 0, maxSteps: 12, aborted: false, toolCallCount: 1 })).toBe(
      'run-tools-and-continue'
    )
    expect(decideAgentTurn({ step: 11, maxSteps: 12, aborted: false, toolCallCount: 1 })).toBe(
      'run-tools-and-stop'
    )
  })
})
