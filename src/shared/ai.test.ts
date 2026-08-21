import { describe, expect, it } from 'vitest'
import {
  aiIsConfigured,
  cannotDeleteLastThread,
  classifyApplyCollision,
  completionsUrl,
  emptyThread,
  parseChatMode,
  parseProposeEditArgs,
  parseToolArgsJson,
  sanitizeChatHistory,
  titleFromPrompt
} from './ai'
import { diffLines, previewTexts } from './lineDiff'
import { choiceDelta, mergeToolCallDeltas, parseSseBlock } from './openaiSse'

describe('titleFromPrompt', () => {
  it('空白を畳んで切る', () => {
    expect(titleFromPrompt('  導入を\n短くして  ')).toBe('導入を 短くして')
  })
})

describe('parseChatMode / emptyThread', () => {
  it('不正な値は ask に落とす', () => {
    expect(parseChatMode('nope')).toBe('ask')
    expect(parseChatMode('edit')).toBe('edit')
  })

  it('emptyThread は指定モードを使う', () => {
    expect(emptyThread('t1', 1, 'agent').mode).toBe('agent')
  })
})

describe('completionsUrl', () => {
  it('末尾に chat/completions を足す', () => {
    expect(completionsUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1/chat/completions')
  })

  it('既についていれば二重にしない', () => {
    expect(completionsUrl('https://x/v1/chat/completions')).toBe('https://x/v1/chat/completions')
  })
})

describe('threads', () => {
  it('最後の1本は消せない', () => {
    expect(cannotDeleteLastThread(1)).toBe(true)
    expect(cannotDeleteLastThread(2)).toBe(false)
  })

  it('壊れた履歴は空スレッドに戻す', () => {
    const hist = sanitizeChatHistory({ threads: [{ id: '', title: 1 }] })
    expect(hist.threads.length).toBe(1)
    expect(hist.threads[0].mode).toBe('ask')
  })

  it('閉じたスレッドは履歴から再開できる', () => {
    const hist = sanitizeChatHistory({
      activeId: 'a',
      threads: [
        { id: 'a', title: '今', messages: [], open: true },
        { id: 'b', title: '前', messages: [{ id: 'm', role: 'user', content: 'hi', createdAt: 1 }], open: false, updatedAt: 2 }
      ]
    })
    expect(hist.threads.find((t) => t.id === 'b')?.open).toBe(false)
    expect(hist.threads.find((t) => t.id === 'a')?.open).toBe(true)
  })
})

describe('propose_edit', () => {
  it('range の不正を弾く', () => {
    const parsed = parseProposeEditArgs({ tab_id: 't', mode: 'replace_range', text: 'x', from: 3, to: 1 }, 't')
    expect('error' in parsed).toBe(true)
  })

  it('未指定タブはフォールバック', () => {
    const parsed = parseProposeEditArgs({ mode: 'replace_all', text: 'hi' }, 'active')
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.tabId).toBe('active')
  })
})

describe('parseToolArgsJson', () => {
  it('Windows パスの生バックスラッシュを拾う', () => {
    const parsed = parseToolArgsJson('{"tab_id":"C:\\Users\\a.md","mode":"replace_all","text":"x"}')
    expect(parsed).toEqual({ tab_id: 'C:\\Users\\a.md', mode: 'replace_all', text: 'x' })
  })
})

describe('collision', () => {
  it('全文が変わっていれば stale', () => {
    expect(
      classifyApplyCollision({
        current: 'b',
        proposal: {
          tabId: 't',
          tabTitle: 'a.md',
          mode: 'replace_all',
          text: 'c',
          baseText: 'a'
        }
      })
    ).toBe('stale')
  })

  it('範囲の中身が違えば stale', () => {
    expect(
      classifyApplyCollision({
        current: 'hello',
        proposal: {
          tabId: 't',
          tabTitle: 'a.md',
          mode: 'replace_range',
          text: 'x',
          from: 0,
          to: 2,
          baseText: 'hello',
          rangeBase: 'he'
        }
      })
    ).toBe('ok')
    expect(
      classifyApplyCollision({
        current: 'HELLO',
        proposal: {
          tabId: 't',
          tabTitle: 'a.md',
          mode: 'replace_range',
          text: 'x',
          from: 0,
          to: 2,
          baseText: 'hello',
          rangeBase: 'he'
        }
      })
    ).toBe('stale')
  })

  it('範囲が文書外なら range-mismatch', () => {
    expect(
      classifyApplyCollision({
        current: 'hi',
        proposal: {
          tabId: 't',
          tabTitle: 'a.md',
          mode: 'replace_range',
          text: 'x',
          from: 0,
          to: 9,
          baseText: 'hi',
          rangeBase: 'hi'
        }
      })
    ).toBe('range-mismatch')
  })
})

describe('aiIsConfigured', () => {
  it('Ollama は Key なしで設定済み', () => {
    expect(aiIsConfigured({ providerId: 'ollama', hasKey: false, model: 'llama3.2' })).toBe(true)
    expect(aiIsConfigured({ providerId: 'openai', hasKey: false, model: 'gpt-4o-mini' })).toBe(false)
  })
})

describe('openai sse', () => {
  it('[DONE] と delta を読む', () => {
    expect(parseSseBlock('data: [DONE]')).toBe('done')
    const payload = parseSseBlock('data: {"choices":[{"delta":{"content":"あ"}}]}')
    expect(choiceDelta(payload).content).toBe('あ')
  })

  it('tool_calls を index で結合する', () => {
    const merged = mergeToolCallDeltas([], [
      { index: 0, id: 'c1', function: { name: 'read', arguments: '{"t' } },
      { index: 0, function: { arguments: 'ab":1}' } }
    ])
    expect(merged[0]).toEqual({ id: 'c1', name: 'read', arguments: '{"tab":1}' })
  })
})

describe('diffLines', () => {
  it('追加と削除を出す', () => {
    const lines = diffLines('a\nb\nc', 'a\nx\nc')
    expect(lines.filter((l) => l.type === 'del').map((l) => l.text)).toEqual(['b'])
    expect(lines.filter((l) => l.type === 'add').map((l) => l.text)).toEqual(['x'])
  })

  it('range プレビューは切片同士', () => {
    const { before, after } = previewTexts({
      mode: 'replace_range',
      baseText: 'hello world',
      text: 'HELLO',
      from: 0,
      to: 5,
      rangeBase: 'hello'
    })
    expect(before).toBe('hello')
    expect(after).toBe('HELLO')
  })
})
