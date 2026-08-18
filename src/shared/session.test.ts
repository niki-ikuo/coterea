import { describe, expect, it } from 'vitest'
import { parseEditorSession } from './session'

describe('parseEditorSession', () => {
  it('壊れた入力は空にする', () => {
    expect(parseEditorSession(null)).toEqual({ tabs: [], active: 0 })
    expect(parseEditorSession('x')).toEqual({ tabs: [], active: 0 })
  })

  it('ファイル・無題・設定を読む', () => {
    const session = parseEditorSession({
      active: 1,
      tabs: [
        { kind: 'file', path: 'C:\\work\\a.md', mdView: 'preview', mdSplitPct: 40, mdScrollSync: false },
        { kind: 'untitled', content: 'hello' },
        { kind: 'settings' },
        { kind: 'file', path: '' },
        { kind: 'settings' }
      ]
    })
    expect(session.tabs).toEqual([
      {
        kind: 'file',
        path: 'C:\\work\\a.md',
        encoding: undefined,
        mdView: 'preview',
        mdSplitPct: 40,
        mdScrollSync: false
      },
      { kind: 'untitled', content: 'hello', encoding: undefined },
      { kind: 'settings' }
    ])
    expect(session.active).toBe(1)
  })

  it('active を範囲内に収める', () => {
    expect(parseEditorSession({ tabs: [{ kind: 'settings' }], active: 9 }).active).toBe(0)
  })
})
