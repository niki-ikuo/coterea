import { describe, expect, it } from 'vitest'
import { isOwnWrite, isUncPath, ownGraceMsFor } from './fileWatchPolicy'

describe('isOwnWrite', () => {
  it('mtime と size が一致すれば自分の書き込み', () => {
    expect(
      isOwnWrite({
        lastOwn: { mtimeMs: 10, size: 4, at: 0 },
        filePath: 'C:\\a.txt',
        mtimeMs: 10,
        size: 4,
        now: 10_000
      })
    ).toBe(true)
  })

  it('猶予内ならメタデータがずれても自分の書き込みとみなす', () => {
    expect(
      isOwnWrite({
        lastOwn: { mtimeMs: 10, size: 4, at: 1000 },
        filePath: 'C:\\a.txt',
        mtimeMs: 11,
        size: 5,
        now: 1000 + ownGraceMsFor('C:\\a.txt') - 1
      })
    ).toBe(true)
  })

  it('猶予を過ぎてメタデータも違うなら外部変更', () => {
    expect(
      isOwnWrite({
        lastOwn: { mtimeMs: 10, size: 4, at: 0 },
        filePath: 'C:\\a.txt',
        mtimeMs: 99,
        size: 9,
        now: 10_000
      })
    ).toBe(false)
  })

  it('UNC はより長い猶予', () => {
    expect(isUncPath('\\\\server\\share\\a.txt')).toBe(true)
    expect(ownGraceMsFor('\\\\server\\share\\a.txt')).toBeGreaterThan(ownGraceMsFor('C:\\a.txt'))
  })
})
