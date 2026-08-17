import { describe, expect, it } from 'vitest'
import { shouldPromptExternalChange } from './externalChange'

describe('shouldPromptExternalChange', () => {
  it('ディスクと編集中が一致なら出さない', () => {
    expect(
      shouldPromptExternalChange({
        diskStatus: 'match',
        disk: 'a',
        editor: 'a',
        lastSaved: 'a',
        stillSaving: false
      })
    ).toBe(false)
  })

  it('共同編集の保存エコー（ディスクが直前の保存内容）は出さない', () => {
    expect(
      shouldPromptExternalChange({
        diskStatus: 'differ',
        disk: 'saved',
        editor: 'saved plus local',
        lastSaved: 'saved',
        stillSaving: false
      })
    ).toBe(false)
  })

  it('保存待ちの間は出さない', () => {
    expect(
      shouldPromptExternalChange({
        diskStatus: 'differ',
        disk: 'other',
        editor: 'mine',
        lastSaved: 'mine',
        stillSaving: true
      })
    ).toBe(false)
  })

  it('本当に外部で変わったときだけ出す', () => {
    expect(
      shouldPromptExternalChange({
        diskStatus: 'differ',
        disk: 'external',
        editor: 'local',
        lastSaved: 'local',
        stillSaving: false
      })
    ).toBe(true)
  })
})
