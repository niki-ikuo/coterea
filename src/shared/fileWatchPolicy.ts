export const LOCAL_DEBOUNCE_MS = 500
export const UNC_DEBOUNCE_MS = 2000
export const LOCAL_OWN_GRACE_MS = 1500
export const UNC_OWN_GRACE_MS = 4000

export function isUncPath(filePath: string): boolean {
  return filePath.startsWith('\\\\') || filePath.startsWith('//')
}

export function debounceMsFor(filePath: string): number {
  return isUncPath(filePath) ? UNC_DEBOUNCE_MS : LOCAL_DEBOUNCE_MS
}

export function ownGraceMsFor(filePath: string): number {
  return isUncPath(filePath) ? UNC_OWN_GRACE_MS : LOCAL_OWN_GRACE_MS
}

export function isOwnWrite(input: {
  lastOwn: { mtimeMs: number; size: number; at: number } | null
  filePath: string
  mtimeMs: number
  size: number
  now?: number
}): boolean {
  const own = input.lastOwn
  if (!own) return false
  if (own.mtimeMs === input.mtimeMs && own.size === input.size) return true
  const now = input.now ?? Date.now()
  return now - own.at < ownGraceMsFor(input.filePath)
}
