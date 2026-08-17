import { describe, expect, it } from 'vitest'
import { menuLabelForKey } from './appMenus'

describe('menuLabelForKey', () => {
  it('Alt+F をファイルにする', () => {
    expect(menuLabelForKey({ code: 'KeyF', key: 'f' })).toBe('ファイル')
  })

  it('表示は V', () => {
    expect(menuLabelForKey({ code: 'KeyV', key: 'v' })).toBe('表示')
  })

  it('関係ないキーは無視', () => {
    expect(menuLabelForKey({ code: 'KeyX', key: 'x' })).toBeNull()
    expect(menuLabelForKey({ code: 'F4', key: 'F4' })).toBeNull()
  })
})
