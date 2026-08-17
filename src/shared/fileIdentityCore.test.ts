import { describe, expect, it } from 'vitest'
import {
  aliasesForLocal,
  fileIdsFromHandle,
  foldLocalUnc,
  parseDosDeviceTarget,
  parseNetShare,
  stripExtended,
  uncKey
} from './fileIdentityCore'
import { idsOverlap } from './fileSession'

const HOSTS = new Set(['pc1', 'localhost', '127.0.0.1'])
const SHARES = new Map([['docs', 'C:\\work']])

describe('stripExtended / parseDosDeviceTarget', () => {
  it('\\\\?\\ と UNC 拡張を外す', () => {
    expect(stripExtended('\\\\?\\C:\\work\\a.txt')).toBe('C:\\work\\a.txt')
    expect(stripExtended('\\\\?\\UNC\\server\\share\\a.txt')).toBe('\\\\server\\share\\a.txt')
  })

  it('subst と Mup を読む', () => {
    expect(parseDosDeviceTarget('\\??\\C:\\real\\path')).toEqual({
      kind: 'path',
      path: 'C:\\real\\path'
    })
    expect(parseDosDeviceTarget('\\Device\\Mup\\fileserver\\docs')).toEqual({
      kind: 'unc',
      server: 'fileserver',
      share: 'docs'
    })
  })
})

describe('foldLocalUnc / aliases', () => {
  it('自ホストの管理シェアをローカルパスに戻す', () => {
    expect(foldLocalUnc('\\\\pc1\\c$\\work\\a.txt', SHARES, HOSTS)).toBe('C:\\work\\a.txt')
  })

  it('自ホストの共有名をルートに展開する', () => {
    expect(foldLocalUnc('\\\\pc1\\docs\\a.txt', SHARES, HOSTS)).toBe('C:\\work\\a.txt')
  })

  it('他ホストの UNC は折らない', () => {
    expect(foldLocalUnc('\\\\other\\docs\\a.txt', SHARES, HOSTS)).toBe('\\\\other\\docs\\a.txt')
  })

  it('ローカルパスから UNC エイリアスを付ける', () => {
    const ids = aliasesForLocal('C:\\work\\a.txt', SHARES, ['pc1'])
    expect(ids).toContain('unc:pc1/c$/work/a.txt')
    expect(ids).toContain('unc:pc1/docs/a.txt')
  })
})

describe('fileIdsFromHandle', () => {
  it('同じボリューム+インデックスなら表記が違っても重なる', () => {
    const local = fileIdsFromHandle({
      expandedPath: 'C:\\work\\a.txt',
      remote: false,
      volumeSerial: 0xabc,
      fileIndex: 12n,
      shortHost: 'pc1',
      thisHosts: HOSTS,
      localAliases: ['pc1'],
      shares: SHARES
    })
    const viaShare = fileIdsFromHandle({
      expandedPath: 'C:\\work\\a.txt',
      remote: false,
      volumeSerial: 0xabc,
      fileIndex: 12n,
      shortHost: 'pc1',
      thisHosts: HOSTS,
      localAliases: ['pc1'],
      shares: SHARES
    })
    expect(idsOverlap(local, viaShare)).toBe(true)
    expect(local).toContain('local:pc1:abc:12')
    expect(local).toContain(uncKey('pc1', 'c$', 'work\\a.txt'))
  })

  it('別 PC の同名ローカルファイルは同期しない', () => {
    const here = fileIdsFromHandle({
      expandedPath: 'C:\\work\\a.txt',
      remote: false,
      volumeSerial: 1,
      fileIndex: 1n,
      shortHost: 'pc1',
      thisHosts: HOSTS,
      localAliases: ['pc1'],
      shares: new Map()
    })
    const there = fileIdsFromHandle({
      expandedPath: 'C:\\work\\a.txt',
      remote: false,
      volumeSerial: 1,
      fileIndex: 1n,
      shortHost: 'pc2',
      thisHosts: new Set(['pc2']),
      localAliases: ['pc2'],
      shares: new Map()
    })
    expect(idsOverlap(here, there)).toBe(false)
  })

  it('他ホスト UNC は unc キーだけ', () => {
    const ids = fileIdsFromHandle({
      expandedPath: '\\\\fileserver\\docs\\a.txt',
      remote: true,
      volumeSerial: 0,
      fileIndex: 0n,
      shortHost: 'pc1',
      thisHosts: HOSTS,
      localAliases: ['pc1'],
      shares: SHARES
    })
    expect(ids).toEqual(['unc:fileserver/docs/a.txt'])
  })

  it('マップドライブが解けないリモートは同期しない', () => {
    expect(
      fileIdsFromHandle({
        expandedPath: 'Z:\\a.txt',
        remote: true,
        volumeSerial: 9,
        fileIndex: 9n,
        shortHost: 'pc1',
        thisHosts: HOSTS,
        localAliases: ['pc1'],
        shares: new Map()
      })
    ).toEqual([])
  })
})

describe('parseNetShare', () => {
  it('共有名とパスを拾い、管理シェアは除外する', () => {
    const shares = parseNetShare(
      ['Share name   Path', 'docs         C:\\work', 'IPC$         ', 'C$           C:\\'].join('\n')
    )
    expect(shares.get('docs')).toBe('C:\\work')
    expect(shares.has('ipc$')).toBe(false)
  })
})
