import { execFile } from 'child_process'
import { promisify } from 'util'
import { hostname, networkInterfaces } from 'os'
import { isAbsolute, resolve as resolvePath } from 'path'
import {
  fileIdsFromHandle,
  foldLocalUnc,
  parseNetShare,
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

export async function resolveFileIds(filePath: string): Promise<string[]> {
  try {
    const { inspectFileHandle } = await import('./win32File')
    const abs = isAbsolute(filePath) ? filePath : resolvePath(filePath)
    const info = inspectFileHandle(abs)
    if (!info) return []

    const shares = await loadShares()
    const hosts = thisHosts()
    let expanded = stripExtended(info.finalPath.replace(/\//g, '\\'))
    expanded = foldLocalUnc(expanded, shares, hosts)

    return fileIdsFromHandle({
      expandedPath: expanded,
      remote: info.remote,
      volumeSerial: info.volumeSerial,
      fileIndex: info.fileIndex,
      shortHost: shortHost(),
      thisHosts: hosts,
      localAliases: localHostAliases(),
      shares
    })
  } catch {
    return []
  }
}
