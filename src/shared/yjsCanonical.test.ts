import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  applyRemoteYjs,
  createYTextDoc,
  encodeYDoc,
  replaceYDocFromSnapshot,
  yTextOf,
  YJS_TEXT_KEY
} from './yjsCanonical'

describe('Yjs 正本スナップショット', () => {
  it('同じ系統の同時編集は増分で合流する', () => {
    const root = createYTextDoc('hello')
    const snap = encodeYDoc(root)
    const a = replaceYDocFromSnapshot(snap)
    const b = replaceYDocFromSnapshot(snap)
    a.getText(YJS_TEXT_KEY).insert(0, 'A')
    b.getText(YJS_TEXT_KEY).insert(5, 'B')
    applyRemoteYjs(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)))
    applyRemoteYjs(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
    expect(yTextOf(a)).toBe(yTextOf(b))
    expect(yTextOf(a)).toContain('A')
    expect(yTextOf(a)).toContain('B')
    expect(yTextOf(a).includes('hello')).toBe(true)
  })

  it('独立に初期化した文書をマージすると本文が二重になる', () => {
    const a = createYTextDoc('hello')
    const b = createYTextDoc('hello')
    a.getText(YJS_TEXT_KEY).insert(5, 'A')
    b.getText(YJS_TEXT_KEY).insert(5, 'B')
    const merged = createYTextDoc('')
    applyRemoteYjs(merged, encodeYDoc(a))
    applyRemoteYjs(merged, encodeYDoc(b))
    expect(yTextOf(merged).length).toBeGreaterThan('helloA'.length)
  })

  it('正本スナップショットで置き換えると独立初期化は捨てる', () => {
    const origin = createYTextDoc('hello')
    origin.getText(YJS_TEXT_KEY).insert(5, 'A')
    const local = createYTextDoc('hello')
    local.getText(YJS_TEXT_KEY).insert(5, 'B')
    const replaced = replaceYDocFromSnapshot(encodeYDoc(origin))
    expect(yTextOf(replaced)).toBe('helloA')
    expect(yTextOf(replaced)).not.toContain('B')
  })
})
