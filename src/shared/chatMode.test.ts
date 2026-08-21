import { describe, expect, it } from 'vitest'
import type { ChatMessage } from './ai'
import {
  buildChatMessages,
  decideAgentTurn,
  defaultContextTabIds,
  formatCurrentUserMessage,
  formatEditReportNudge,
  includesActiveFileBody,
  maxStepsForMode,
  resolveOpenTabId,
  resolveProposeTabId,
  shouldPersistAfterProposalApply,
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
  it('Ask / Edit は常に本文を載せ、Agent は対象ファイルがあるとき載せる', () => {
    expect(includesActiveFileBody('ask')).toBe(true)
    expect(includesActiveFileBody('edit')).toBe(true)
    expect(includesActiveFileBody('agent', true)).toBe(true)
    expect(includesActiveFileBody('agent', false)).toBe(false)
  })

  it('カプセル無しの既定タブは Ask/Edit=カレント、Agent=全部', () => {
    const open = ['a', 'b', 'c']
    expect(defaultContextTabIds({ mode: 'ask', openTabIds: open, activeTabId: 'b' })).toEqual(['b'])
    expect(defaultContextTabIds({ mode: 'edit', openTabIds: open, activeTabId: 'b' })).toEqual(['b'])
    expect(defaultContextTabIds({ mode: 'agent', openTabIds: open, activeTabId: 'b' })).toEqual([
      'a',
      'b',
      'c'
    ])
    expect(defaultContextTabIds({ mode: 'ask', openTabIds: open, activeTabId: null })).toEqual([])
  })

  it('ツールはモードごとに最小限', () => {
    expect(toolsForMode('ask')).toEqual([])
    expect(toolsForMode('edit')).toEqual(['propose_edit'])
    expect(toolsForMode('agent')).toEqual(['list_open_tabs', 'read_tab', 'propose_edit', 'update_todo'])
  })

  it('ステップ数は Agent だけ設定値', () => {
    expect(maxStepsForMode('ask', 12)).toBe(1)
    expect(maxStepsForMode('edit', 12)).toBe(1)
    expect(maxStepsForMode('agent', 12)).toBe(12)
    expect(maxStepsForMode('agent', 0)).toBe(12)
  })
})

describe('formatCurrentUserMessage', () => {
  it('Ask は添付ファイル本文と質問を1通にまとめる', () => {
    const text = formatCurrentUserMessage({
      mode: 'ask',
      prompt: '導入を短くして',
      files: [file],
      selections: []
    })
    expect(text).toContain('[添付ファイル: notes.md]')
    expect(text).toContain('導入を長く書いた。')
    expect(text).toContain('[ユーザー]\n導入を短くして')
  })

  it('添付が無い Ask はファイルなしと質問だけ', () => {
    const text = formatCurrentUserMessage({
      mode: 'ask',
      prompt: 'こんにちは',
      files: [],
      selections: []
    })
    expect(text).toContain('[添付ファイルはありません]')
    expect(text).toContain('[ユーザー]\nこんにちは')
  })

  it('複数ファイルと選択範囲を載せる', () => {
    const text = formatCurrentUserMessage({
      mode: 'edit',
      prompt: '直して',
      files: [
        file,
        { id: 'tab-2', title: 'other.md', language: 'markdown', body: '別文書' }
      ],
      selections: [
        { from: 0, to: 2, text: '導入', tabId: 'tab-1', title: 'notes.md', lineFrom: 1, lineTo: 1 }
      ]
    })
    expect(text).toContain('[添付ファイル 1: notes.md]')
    expect(text).toContain('[添付ファイル 2: other.md]')
    expect(text).toContain('[選択範囲（notes.md:1）]')
    expect(text).toContain('replace_range を優先')
  })

  it('Agent は添付本文を載せ、他タブはツールで読むよう補足する', () => {
    const text = formatCurrentUserMessage({
      mode: 'agent',
      prompt: '全体を整理',
      files: [file],
      selections: [{ from: 0, to: 2, text: '導入', tabId: 'tab-1', title: 'notes.md', lineFrom: 1, lineTo: 1 }]
    })
    expect(text).toContain('[添付ファイル: notes.md]')
    expect(text).toContain('id: tab-1')
    expect(text).toContain('導入を長く書いた。')
    expect(text).toContain('read_tab')
    expect(text).toContain('この範囲を優先して検討してください。')
    expect(text).toContain('[ユーザー]\n全体を整理')
  })

  it('Agent で添付が無いときはツール案内だけ', () => {
    const text = formatCurrentUserMessage({
      mode: 'agent',
      prompt: '調べて',
      files: [],
      selections: []
    })
    expect(text).toContain('[作業対象]')
    expect(text).toContain('添付はありません')
    expect(text).toContain('read_tab')
    expect(text).not.toContain('[添付ファイル')
  })
})

describe('buildChatMessages', () => {
  it('最新のユーザー発言にだけ今の添付を載せ、提案は要約する', () => {
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
      files: [file],
      selections: []
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
    expect(systemPromptFor('edit')).toContain('tab_id は省略')
    expect(systemPromptFor('edit')).toContain('いまのファイル')
    expect(systemPromptFor('edit')).toContain('文章で報告')
    expect(systemPromptFor('agent')).toContain('read_tab')
    expect(systemPromptFor('agent')).toContain('開いている全タブ')
  })
})

describe('formatEditReportNudge', () => {
  it('提案後の報告を促す', () => {
    expect(formatEditReportNudge()).toMatch(/短く報告/)
    expect(formatEditReportNudge()).toMatch(/ツールは使わず/)
  })
})

describe('tab resolve', () => {
  it('Edit は LLM の tab_id を捨てて主タブを使う', () => {
    expect(resolveProposeTabId({ mode: 'edit', requested: 'wrong', activeTabId: 'tab-1' })).toBe('tab-1')
    expect(resolveProposeTabId({ mode: 'edit', requested: 'wrong', activeTabId: null })).toBe(null)
  })

  it('Agent は指定タブを優先する', () => {
    expect(resolveProposeTabId({ mode: 'agent', requested: 'other', activeTabId: 'tab-1' })).toBe('other')
  })

  it('タイトルやパスでも開いているタブを見つける', () => {
    const tabs = [
      { id: 'uuid-1', title: 'notes.md', path: 'C:\\work\\notes.md' },
      { id: 'uuid-2', title: 'other.md', path: 'C:\\work\\other.md' }
    ]
    expect(resolveOpenTabId({ requested: 'notes.md', tabs, activeTabId: 'uuid-2', fallbackToActive: false })).toBe(
      'uuid-1'
    )
    expect(
      resolveOpenTabId({ requested: 'C:\\work\\other.md', tabs, activeTabId: 'uuid-1', fallbackToActive: false })
    ).toBe('uuid-2')
    expect(resolveOpenTabId({ requested: 'missing', tabs, activeTabId: 'uuid-1', fallbackToActive: true })).toBe(
      'uuid-1'
    )
    expect(resolveOpenTabId({ requested: 'missing', tabs, activeTabId: 'uuid-1', fallbackToActive: false })).toBe(
      undefined
    )
  })
})

describe('shouldPersistAfterProposalApply', () => {
  it('単独編集の実ファイルだけ即時保存する', () => {
    expect(shouldPersistAfterProposalApply(false, 'C:\\work\\notes.md')).toBe(true)
    expect(shouldPersistAfterProposalApply(true, 'C:\\work\\notes.md')).toBe(false)
    expect(shouldPersistAfterProposalApply(false, null)).toBe(false)
    expect(shouldPersistAfterProposalApply(true, null)).toBe(false)
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
