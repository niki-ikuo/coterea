import { app } from 'electron'
import { existsSync, statSync } from 'fs'
import { isAbsolute, join, resolve } from 'path'

function normalize(p: string): string {
  return resolve(p).toLowerCase()
}

export function filesFromArgv(argv: string[]): string[] {
  const skip = new Set(
    [process.execPath, app.getAppPath(), join(__dirname, 'index.js')].map((item) => normalize(item))
  )
  const found: string[] = []
  for (const arg of argv) {
    if (!arg || arg.startsWith('-')) continue
    let resolved: string
    try {
      resolved = isAbsolute(arg) ? arg : resolve(arg)
    } catch {
      continue
    }
    if (skip.has(normalize(resolved))) continue
    try {
      if (existsSync(resolved) && statSync(resolved).isFile()) found.push(resolved)
    } catch {
      /* ignore */
    }
  }
  return found
}
