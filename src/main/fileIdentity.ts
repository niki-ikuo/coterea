import { execFile } from 'child_process'
import { promisify } from 'util'
import { hostname, networkInterfaces } from 'os'
import { isAbsolute, resolve as resolvePath } from 'path'
import { inspectFileHandle, stripExtended } from './win32File'

const execFileAsync = promisify(execFile)

type ShareMap = Map<string, string>

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
  const shares: ShareMap = new Map()
  const netShare = await run('net', ['share'])
  for (const line of netShare.split(/\r?\n/)) {
    const match = line.match(/^(\S+)\s+([A-Za-z]:\\[^\s]*)/)
    if (!match) continue
    const name = match[1]
    if (/^(Share|共有|The|コマンド|---)/i.test(name)) continue
    if (/^(IPC|ADMIN|print)\$$/i.test(name)) continue
    shares.set(name.toLowerCase(), match[2].trim())
  }
  shareCache = { at: Date.now(), shares }
  return shares
}

function splitUnc(pathStr: string): { server: string; share: string; rest: string } | null {
  const normalized = pathStr.replace(/\//g, '\\')
  const match = normalized.match(/^\\\\([^\\]+)\\([^\\]+)(?:\\(.*))?$/)
  if (!match) return null
  return { server: match[1], share: match[2], rest: match[3] ?? '' }
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

function isThisHost(server: string): boolean {
  const s = server.toLowerCase()
  const hosts = thisHosts()
  if (hosts.has(s)) return true
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(s) || s.includes(':')) return false
  return hosts.has(s.split('.')[0])
}

function hostKey(server: string): string {
  const s = server.toLowerCase()
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(s) || s.includes(':')) return s
  return s.split('.')[0]
}

function shortHost(): string {
  return hostname().toLowerCase().split('.')[0]
}

function uncKey(server: string, share: string, rest: string): string {
  const tail = rest.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase()
  return `unc:${hostKey(server)}/${share.toLowerCase()}/${tail}`
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

function foldLocalUnc(winPath: string, shares: ShareMap): string {
  const unc = splitUnc(winPath)
  if (!unc || !isThisHost(unc.server)) return winPath
  const share = unc.share.toLowerCase()
  const admin = share.match(/^([a-z])\$$/)
  if (admin) return `${admin[1].toUpperCase()}:\\${unc.rest}`
  const root = shares.get(share)
  if (root) return root.replace(/\\$/, '') + (unc.rest ? `\\${unc.rest}` : '')
  return winPath
}

function aliasesForLocal(absPath: string, shares: ShareMap): string[] {
  const ids: string[] = []
  const hosts = localHostAliases()
  const win = absPath.replace(/\//g, '\\')
  const drive = win.match(/^([A-Za-z]):\\(.*)$/)
  if (drive) {
    for (const host of hosts) ids.push(uncKey(host, `${drive[1]}$`, drive[2]))
  }
  const lower = win.toLowerCase()
  for (const [share, root] of shares) {
    const prefix = root.replace(/\\$/, '').toLowerCase()
    if (lower === prefix || lower.startsWith(`${prefix}\\`)) {
      const rest = win.slice(root.replace(/\\$/, '').length).replace(/^\\/, '')
      for (const host of hosts) ids.push(uncKey(host, share, rest))
    }
  }
  return ids
}

export async function resolveFileIds(filePath: string): Promise<string[]> {
  try {
    const abs = isAbsolute(filePath) ? filePath : resolvePath(filePath)
    const info = inspectFileHandle(abs)
    if (!info) return []

    const shares = await loadShares()
    let expanded = stripExtended(info.finalPath.replace(/\//g, '\\'))
    expanded = foldLocalUnc(expanded, shares)

    const unc = splitUnc(expanded)
    const unresolvedRemote =
      info.remote && !unc && /^[A-Za-z]:\\/.test(expanded)
    if (unresolvedRemote) return []

    if (unc && !isThisHost(unc.server)) {
      return [uncKey(unc.server, unc.share, unc.rest)]
    }

    const ids = new Set<string>()
    if (unc) ids.add(uncKey(unc.server, unc.share, unc.rest))

    if (info.fileIndex !== 0n && info.volumeSerial !== 0) {
      ids.add(`local:${shortHost()}:${info.volumeSerial.toString(16)}:${info.fileIndex.toString()}`)
    }
    if (/^[A-Za-z]:\\/.test(expanded)) {
      for (const extra of aliasesForLocal(expanded, shares)) ids.add(extra)
    }

    return [...ids]
  } catch {
    return []
  }
}
