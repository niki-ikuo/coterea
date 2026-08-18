import { execFile } from 'child_process'
import { promises as dns } from 'dns'
import { promisify } from 'util'
import { hostname, networkInterfaces } from 'os'
import { isAbsolute, resolve as resolvePath } from 'path'
import {
  fileIdsFromHandle,
  foldLocalUnc,
  parseNetShare,
  splitUnc,
  stripExtended,
  type ShareMap
} from '../shared/fileIdentityCore'

const execFileAsync = promisify(execFile)

let shareCache: { at: number; shares: ShareMap } | null = null
const CACHE_MS = 8000

async function run(cmd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { windowsHide: true, timeout: 5000 })
    return stdout
  } catch {
    return ''
  }
}

async function loadShares(): Promise<ShareMap> {
  if (shareCache && Date.now() - shareCache.at < CACHE_MS) return shareCache.shares
  const shares = parseNetShare(await run('net', ['share']))
  shareCache = { at: Date.now(), shares }
  return shares
}

function thisHosts(): Set<string> {
  const host = hostname().toLowerCase()
  const names = new Set([host, host.split('.')[0], 'localhost', '127.0.0.1', '::1'])
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.address) names.add(addr.address.toLowerCase())
    }
  }
  return names
}

function shortHost(): string {
  return hostname().toLowerCase().split('.')[0]
}

function localHostAliases(): string[] {
  const names = [shortHost()]
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (!addr.internal && addr.address.includes('.')) names.push(addr.address.toLowerCase())
    }
  }
  return [...new Set(names)]
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/
const hostAliasCache = new Map<string, { at: number; aliases: string[] }>()
const HOST_ALIAS_MS = 60_000

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      }
    )
  })
}

async function extraUncHostsFor(server: string): Promise<string[]> {
  const key = server.toLowerCase()
  const cached = hostAliasCache.get(key)
  if (cached && Date.now() - cached.at < HOST_ALIAS_MS) return cached.aliases

  const aliases: string[] = []
  if (IPV4.test(key)) {
    const names = await withTimeout(dns.reverse(server), 800)
    for (const name of names ?? []) aliases.push(name.split('.')[0] ?? name)
  } else {
    const found = await withTimeout(dns.lookup(server, { all: true, family: 4 }), 800)
    for (const row of found ?? []) aliases.push(row.address)
  }

  const unique = [...new Set(aliases.map((a) => a.toLowerCase()).filter((a) => a && a !== key))]
  hostAliasCache.set(key, { at: Date.now(), aliases: unique })
  return unique
}

export async function resolveFileIds(filePath: string): Promise<string[]> {
  try {
    const { inspectFileHandle, isRemotePath } = await import('./win32File')
    const abs = isAbsolute(filePath) ? filePath : resolvePath(filePath)
    const info = inspectFileHandle(abs)
    if (!info) return []

    const shares = await loadShares()
    const hosts = thisHosts()
    let expanded = stripExtended(info.finalPath.replace(/\//g, '\\'))
    expanded = foldLocalUnc(expanded, shares, hosts)
    const unc = splitUnc(expanded)

    return fileIdsFromHandle({
      expandedPath: expanded,
      remote: isRemotePath(expanded),
      volumeSerial: info.volumeSerial,
      fileIndex: info.fileIndex,
      shortHost: shortHost(),
      thisHosts: hosts,
      localAliases: localHostAliases(),
      shares,
      extraUncHosts: unc ? await extraUncHostsFor(unc.server) : []
    })
  } catch {
    return []
  }
}
