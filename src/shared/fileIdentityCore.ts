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

export function parseDosDeviceTarget(
  target: string
): { kind: 'unc'; server: string; share: string } | { kind: 'path'; path: string } | null {
  const t = target.split('\0')[0]?.trim() ?? ''
  if (!t) return null
  const subst = t.match(/^\\\?\?\\([A-Za-z]:\\.*)$/)
  if (subst) return { kind: 'path', path: subst[1] }
  const redirector = t.match(
    /\\(?:Device\\)?(?:Mup\\)?(?:LanmanRedirector|Mup)(?:\\;[^\\]*)?\\([^\\;][^\\]*)\\([^\\]+)/i
  )
  if (redirector) return { kind: 'unc', server: redirector[1], share: redirector[2] }
  const mup = t.match(/^\\Device\\Mup\\([^\\]+)\\([^\\]+)/i)
  if (mup) return { kind: 'unc', server: mup[1], share: mup[2] }
  return null
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

export function fileIdsFromHandle(input: {
  expandedPath: string
  remote: boolean
  volumeSerial: number
  fileIndex: bigint
  shortHost: string
  thisHosts: Set<string>
  localAliases: string[]
  shares: ShareMap
}): string[] {
  const unc = splitUnc(input.expandedPath)
  const unresolvedRemote = input.remote && !unc && /^[A-Za-z]:\\/.test(input.expandedPath)
  if (unresolvedRemote) return []

  if (unc && !isThisHost(unc.server, input.thisHosts)) {
    return [uncKey(unc.server, unc.share, unc.rest)]
  }

  const ids = new Set<string>()
  if (unc) ids.add(uncKey(unc.server, unc.share, unc.rest))
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
