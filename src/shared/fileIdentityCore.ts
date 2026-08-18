export type ShareMap = Map<string, string>

export type FileHandleInfo = {
  finalPath: string
  remote: boolean
  volumeSerial: number
  fileIndex: bigint
}

export function stripExtended(pathStr: string): string {
  if (pathStr.startsWith('\\\\?\\UNC\\')) return `\\\\${pathStr.slice(8)}`
  if (pathStr.startsWith('\\\\?\\')) return pathStr.slice(4)
  return pathStr
}

export type DosDeviceTarget =
  | { kind: 'unc'; server: string; share: string; rest: string }
  | { kind: 'path'; path: string }

function joinUnderRoot(root: string, rest: string): string {
  const base = root.replace(/\\$/, '')
  const tail = rest.replace(/^\\+/, '')
  return tail ? `${base}\\${tail}` : base
}

export function parseDosDeviceTarget(target: string): DosDeviceTarget | null {
  const t = target.split('\0')[0]?.trim() ?? ''
  if (!t) return null
  const subst = t.match(/^\\\?\?\\([A-Za-z]:\\.*)$/)
  if (subst) return { kind: 'path', path: subst[1] }
  const uncNt = t.match(/^\\\?\?\\UNC\\([^\\]+)\\([^\\]+)(?:\\(.*))?$/i)
  if (uncNt) return { kind: 'unc', server: uncNt[1], share: uncNt[2], rest: uncNt[3] ?? '' }

  const parts = t.split('\\').filter((p) => p.length > 0)
  let i = 0
  if (parts[i]?.toLowerCase() === 'device') i += 1
  const kind = parts[i]?.toLowerCase()
  if (kind === 'mup' || kind === 'lanmanredirector') {
    i += 1
    while (i < parts.length && (parts[i].startsWith(';') || /^(mup|lanmanredirector)$/i.test(parts[i]))) {
      i += 1
    }
    const server = parts[i]
    const share = parts[i + 1]
    if (server && share && !server.startsWith(';') && !share.startsWith(';')) {
      return { kind: 'unc', server, share, rest: parts.slice(i + 2).join('\\') }
    }
  }
  return null
}

export function applyDosDeviceToDrivePath(winPath: string, deviceTarget: string): string | null {
  const match = winPath.match(/^([A-Za-z]):\\(.*)$/)
  if (!match) return null
  const parsed = parseDosDeviceTarget(deviceTarget)
  if (!parsed) return null
  if (parsed.kind === 'path') return joinUnderRoot(parsed.path, match[2])
  const shareRoot = `\\\\${parsed.server}\\${parsed.share}`
  return joinUnderRoot(parsed.rest ? `${shareRoot}\\${parsed.rest}` : shareRoot, match[2])
}

export function parseNetShare(stdout: string): ShareMap {
  const shares: ShareMap = new Map()
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^(\S+)\s+([A-Za-z]:\\[^\s]*)/)
    if (!match) continue
    const name = match[1]
    if (/^(Share|共有|The|コマンド|---)/i.test(name)) continue
    if (/^(IPC|ADMIN|print)\$$/i.test(name)) continue
    shares.set(name.toLowerCase(), match[2].trim())
  }
  return shares
}

export function splitUnc(pathStr: string): { server: string; share: string; rest: string } | null {
  const normalized = pathStr.replace(/\//g, '\\')
  const match = normalized.match(/^\\\\([^\\]+)\\([^\\]+)(?:\\(.*))?$/)
  if (!match) return null
  return { server: match[1], share: match[2], rest: match[3] ?? '' }
}

export function hostKey(server: string): string {
  const s = server.toLowerCase()
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(s) || s.includes(':')) return s
  return s.split('.')[0]
}

export function isThisHost(server: string, hosts: Set<string>): boolean {
  const s = server.toLowerCase()
  if (hosts.has(s)) return true
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(s) || s.includes(':')) return false
  return hosts.has(s.split('.')[0])
}

export function uncKey(server: string, share: string, rest: string): string {
  const tail = rest.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase()
  return `unc:${hostKey(server)}/${share.toLowerCase()}/${tail}`
}

export function foldLocalUnc(winPath: string, shares: ShareMap, hosts: Set<string>): string {
  const unc = splitUnc(winPath)
  if (!unc || !isThisHost(unc.server, hosts)) return winPath
  const share = unc.share.toLowerCase()
  const admin = share.match(/^([a-z])\$$/)
  if (admin) return `${admin[1].toUpperCase()}:\\${unc.rest}`
  const root = shares.get(share)
  if (root) return root.replace(/\\$/, '') + (unc.rest ? `\\${unc.rest}` : '')
  return winPath
}

export function aliasesForLocal(absPath: string, shares: ShareMap, hostAliases: string[]): string[] {
  const ids: string[] = []
  const win = absPath.replace(/\//g, '\\')
  const drive = win.match(/^([A-Za-z]):\\(.*)$/)
  if (drive) {
    for (const host of hostAliases) ids.push(uncKey(host, `${drive[1]}$`, drive[2]))
  }
  const lower = win.toLowerCase()
  for (const [share, root] of shares) {
    const prefix = root.replace(/\\$/, '').toLowerCase()
    if (lower === prefix || lower.startsWith(`${prefix}\\`)) {
      const rest = win.slice(root.replace(/\\$/, '').length).replace(/^\\/, '')
      for (const host of hostAliases) ids.push(uncKey(host, share, rest))
    }
  }
  return ids
}

export function addUncHostAliases(ids: Set<string>, share: string, rest: string, hosts: string[]): void {
  for (const host of hosts) {
    if (host) ids.add(uncKey(host, share, rest))
  }
}

export function fileIdsFromHandle(input: {
  expandedPath: string
  remote: boolean
  volumeSerial: number
  fileIndex: bigint
  shortHost: string
  thisHosts: Set<string>
  localAliases: string[]
  shares: ShareMap
  extraUncHosts?: string[]
}): string[] {
  const unc = splitUnc(input.expandedPath)
  const unresolvedRemote = input.remote && !unc && /^[A-Za-z]:\\/.test(input.expandedPath)
  if (unresolvedRemote) return []

  const extras = input.extraUncHosts ?? []
  if (unc && !isThisHost(unc.server, input.thisHosts)) {
    const ids = new Set<string>([uncKey(unc.server, unc.share, unc.rest)])
    addUncHostAliases(ids, unc.share, unc.rest, extras)
    return [...ids]
  }

  const ids = new Set<string>()
  if (unc) {
    ids.add(uncKey(unc.server, unc.share, unc.rest))
    addUncHostAliases(ids, unc.share, unc.rest, extras)
  }
  if (input.fileIndex !== 0n && input.volumeSerial !== 0) {
    ids.add(`local:${input.shortHost}:${input.volumeSerial.toString(16)}:${input.fileIndex.toString()}`)
  }
  if (/^[A-Za-z]:\\/.test(input.expandedPath)) {
    for (const extra of aliasesForLocal(input.expandedPath, input.shares, input.localAliases)) {
      ids.add(extra)
    }
  }
  return [...ids]
}
