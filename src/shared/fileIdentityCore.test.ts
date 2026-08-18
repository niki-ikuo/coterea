import { describe, expect, it } from 'vitest'
import {
  aliasesForLocal,
  applyDosDeviceToDrivePath,
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
      share: 'docs',
      rest: ''
    })
    expect(parseDosDeviceTarget('\\??\\UNC\\fileserver\\docs')).toEqual({
      kind: 'unc',
      server: 'fileserver',
      share: 'docs',
      rest: ''
    })
  })

  it('マップドライブの QueryDosDevice 形式を UNC にする', () => {
    expect(parseDosDeviceTarget('\\Device\\LanmanRedirector\\;Z:0\\fileserver\\docs')).toEqual({
      kind: 'unc',
      server: 'fileserver',
      share: 'docs',
      rest: ''
    })
    expect(
      parseDosDeviceTarget('\\Device\\Mup\\;LanmanRedirector\\;Z:0\\fileserver\\docs')
    ).toEqual({
      kind: 'unc',
      server: 'fileserver',
      share: 'docs',
      rest: ''
    })
    expect(
      parseDosDeviceTarget(
        '\\Device\\Mup\\;LanmanRedirector\\;Z:0000000000001234\\fileserver\\docs'
      )
    ).toEqual({
      kind: 'unc',
      server: 'fileserver',
      share: 'docs',
      rest: ''
    })
  })

  it('共有のサブフォルダへ張ったマップドライブの残りパスを残す', () => {
    expect(
      parseDosDeviceTarget(
        '\\Device\\Mup\\;LanmanRedirector\\;Z:0\\niki-2023\\c$\\Users\\niki.RCS-TEC\\Desktop\\sandbox6'
      )
    ).toEqual({
      kind: 'unc',
      server: 'niki-2023',
      share: 'c$',
      rest: 'Users\\niki.RCS-TEC\\Desktop\\sandbox6'
    })
    expect(
      applyDosDeviceToDrivePath(
        'Z:\\test.txt',
        '\\Device\\Mup\\;LanmanRedirector\\;Z:0\\niki-2023\\c$\\Users\\niki.RCS-TEC\\Desktop\\sandbox6'
      )
    ).toBe('\\\\niki-2023\\c$\\Users\\niki.RCS-TEC\\Desktop\\sandbox6\\test.txt')
    expect(applyDosDeviceToDrivePath('Z:\\test.txt', '\\??\\C:\\Users\\niki.RCS-TEC\\Desktop\\sandbox6')).toBe(
      'C:\\Users\\niki.RCS-TEC\\Desktop\\sandbox6\\test.txt'
    )
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

  it('他ホスト UNC の IP とホスト名は同一視する', () => {
    const byName = fileIdsFromHandle({
      expandedPath: '\\\\niki-2023\\c$\\Users\\niki.RCS-TEC\\Desktop\\sandbox6\\test.txt',
      remote: true,
      volumeSerial: 0,
      fileIndex: 0n,
      shortHost: 'pc2',
      thisHosts: new Set(['pc2']),
      localAliases: ['pc2'],
      shares: new Map(),
      extraUncHosts: ['192.168.1.10']
    })
    const byIp = fileIdsFromHandle({
      expandedPath: '\\\\192.168.1.10\\c$\\Users\\niki.RCS-TEC\\Desktop\\sandbox6\\test.txt',
      remote: true,
      volumeSerial: 0,
      fileIndex: 0n,
      shortHost: 'pc2',
      thisHosts: new Set(['pc2']),
      localAliases: ['pc2'],
      shares: new Map(),
      extraUncHosts: ['niki-2023']
    })
    expect(idsOverlap(byName, byIp)).toBe(true)
    expect(byName).toContain('unc:192.168.1.10/c$/users/niki.rcs-tec/desktop/sandbox6/test.txt')
    expect(byIp).toContain('unc:niki-2023/c$/users/niki.rcs-tec/desktop/sandbox6/test.txt')
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

  it('マップドライブを UNC に展開すれば他ホスト UNC と同一視する', () => {
    const viaUnc = fileIdsFromHandle({
      expandedPath: '\\\\fileserver\\docs\\a.txt',
      remote: true,
      volumeSerial: 0,
      fileIndex: 0n,
      shortHost: 'pc1',
      thisHosts: HOSTS,
      localAliases: ['pc1'],
      shares: SHARES
    })
    const viaMapped = fileIdsFromHandle({
      expandedPath: '\\\\fileserver\\docs\\a.txt',
      remote: true,
      volumeSerial: 9,
      fileIndex: 9n,
      shortHost: 'pc2',
      thisHosts: new Set(['pc2']),
      localAliases: ['pc2'],
      shares: new Map()
    })
    expect(idsOverlap(viaUnc, viaMapped)).toBe(true)
    expect(viaUnc).toEqual(['unc:fileserver/docs/a.txt'])
    expect(viaMapped).toEqual(['unc:fileserver/docs/a.txt'])
  })

  it('C$ UNC とローカルフォルダへ subst したマップは同一視する', () => {
    const viaUnc = fileIdsFromHandle({
      expandedPath: 'C:\\Users\\niki.RCS-TEC\\Desktop\\sandbox6\\test.txt',
      remote: false,
      volumeSerial: 0xabc,
      fileIndex: 99n,
      shortHost: 'niki-2023',
      thisHosts: new Set(['niki-2023']),
      localAliases: ['niki-2023'],
      shares: new Map()
    })
    const viaMapped = fileIdsFromHandle({
      expandedPath: 'C:\\Users\\niki.RCS-TEC\\Desktop\\sandbox6\\test.txt',
      remote: false,
      volumeSerial: 0xabc,
      fileIndex: 99n,
      shortHost: 'niki-2023',
      thisHosts: new Set(['niki-2023']),
      localAliases: ['niki-2023'],
      shares: new Map()
    })
    const viaRemoteCdollar = fileIdsFromHandle({
      expandedPath: '\\\\niki-2023\\c$\\Users\\niki.RCS-TEC\\Desktop\\sandbox6\\test.txt',
      remote: true,
      volumeSerial: 0,
      fileIndex: 0n,
      shortHost: 'pc2',
      thisHosts: new Set(['pc2']),
      localAliases: ['pc2'],
      shares: new Map()
    })
    expect(idsOverlap(viaUnc, viaMapped)).toBe(true)
    expect(idsOverlap(viaUnc, viaRemoteCdollar)).toBe(true)
    expect(viaUnc).toContain('unc:niki-2023/c$/users/niki.rcs-tec/desktop/sandbox6/test.txt')
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
