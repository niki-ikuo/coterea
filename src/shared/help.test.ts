import { describe, expect, it } from 'vitest'
import { parseHelpFrontmatter, pickHelpSourceIds, resolveHelpId } from './help'

describe('parseHelpFrontmatter', () => {
  it('title と lists を読む', () => {
    const raw = `---
title: Agent
keywords:
  - Agent
  - Ask
category: ai
related:
  - chat.md
commands:
  - Open Provider
---

# Agent
本文
`
    const { meta, body } = parseHelpFrontmatter(raw)
    expect(meta.title).toBe('Agent')
    expect(meta.keywords).toEqual(['Agent', 'Ask'])
    expect(meta.category).toBe('ai')
    expect(meta.related).toEqual(['chat.md'])
    expect(meta.commands).toEqual(['Open Provider'])
    expect(body).toContain('# Agent')
  })
})

describe('resolveHelpId', () => {
  it('同じフォルダの相対パスを解決する', () => {
    expect(resolveHelpId('ai/chat.md', 'modes.md')).toBe('ai/modes.md')
    expect(resolveHelpId('ai/chat.md', '../settings.md')).toBe('settings.md')
  })
})

describe('pickHelpSourceIds', () => {
  it('検索ヒットを優先し上限で切る', () => {
    expect(pickHelpSourceIds(['ai/chat.md', 'index.md'], ['settings.md', 'collab.md'], undefined, 2)).toEqual([
      'ai/chat.md',
      'index.md'
    ])
  })
})
