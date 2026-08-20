import { describe, expect, it } from 'vitest'
import { lineSelectionRange } from './lineNumberSelect'

describe('lineSelectionRange', () => {
  it('単一行は次行先頭まで選ぶ', () => {
    expect(lineSelectionRange(10, 20, 3, 3)).toEqual({
      startLineNumber: 3,
      startColumn: 1,
      endLineNumber: 4,
      endColumn: 1
    })
  })

  it('最終行は行末まで選ぶ', () => {
    expect(lineSelectionRange(5, 12, 5, 5)).toEqual({
      startLineNumber: 5,
      startColumn: 1,
      endLineNumber: 5,
      endColumn: 12
    })
  })

  it('ドラッグで複数行を選ぶ', () => {
    expect(lineSelectionRange(10, 5, 2, 5)).toEqual({
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 6,
      endColumn: 1
    })
  })
})
