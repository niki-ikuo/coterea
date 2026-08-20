import { describe, expect, it } from 'vitest'
import {
  dropInsertIndex,
  dropSide,
  moveById,
  moveItem,
  reorderOpenById
} from './tabOrder'

describe('moveItem', () => {
  it('前から後ろへ移す', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('後ろから前へ移す', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('同じ位置ならコピーのみ', () => {
    const items = ['a', 'b']
    expect(moveItem(items, 1, 1)).toEqual(['a', 'b'])
    expect(moveItem(items, 1, 1)).not.toBe(items)
  })
})

describe('dropInsertIndex', () => {
  const rect = { left: 0, width: 100 }

  it('左半分ならその位置の前へ', () => {
    expect(dropInsertIndex(2, 0, 10, rect)).toBe(0)
  })

  it('右半分ならその位置の後ろへ（from が前なら補正）', () => {
    expect(dropInsertIndex(0, 2, 80, rect)).toBe(2)
  })
})

describe('dropSide', () => {
  it('左右を判定する', () => {
    expect(dropSide(10, { left: 0, width: 100 })).toBe('before')
    expect(dropSide(80, { left: 0, width: 100 })).toBe('after')
  })
})

describe('moveById', () => {
  it('id で移す', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(moveById(items, 'c', 0).map((x) => x.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('reorderOpenById', () => {
  it('open だけ並べ替え、closed の位置は保つ', () => {
    const items = [
      { id: 'a', open: true },
      { id: 'x', open: false },
      { id: 'b', open: true },
      { id: 'c', open: true }
    ]
    const next = reorderOpenById(items, 'c', 0, (t) => t.open)
    expect(next.map((t) => t.id)).toEqual(['c', 'x', 'a', 'b'])
  })
})
