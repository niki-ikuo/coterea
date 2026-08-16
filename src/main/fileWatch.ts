import { watch, type FSWatcher } from 'fs'
import { basename, dirname } from 'path'
import { stat } from 'fs/promises'
import { BrowserWindow } from 'electron'
import type { WriteFileResult } from '../shared/types'

type DirWatch = {
  watcher: FSWatcher
  files: Set<string>
}

type FileMeta = {
  timer: NodeJS.Timeout | null
  lastOwn: { mtimeMs: number; size: number; at: number } | null
  lastSeen: { mtimeMs: number; size: number } | null
  fileWatcher: FSWatcher | null
}

const LOCAL_DEBOUNCE_MS = 500
const UNC_DEBOUNCE_MS = 2000
const LOCAL_OWN_GRACE_MS = 1500
const UNC_OWN_GRACE_MS = 4000

function isUncPath(filePath: string): boolean {
  return filePath.startsWith('\\\\') || filePath.startsWith('//')
}

export class FileWatcher {
  private dirs = new Map<string, DirWatch>()
  private files = new Map<string, FileMeta>()
  private win: BrowserWindow | null = null

  attachWindow(win: BrowserWindow): void {
    this.win = win
    win.on('closed', () => {
      if (this.win === win) this.win = null
    })
  }

  noteOwnWrite(filePath: string, meta: WriteFileResult): void {
    const lastOwn = { ...meta, at: Date.now() }
    const entry = this.files.get(filePath)
    if (entry) {
      entry.lastOwn = lastOwn
      entry.lastSeen = { mtimeMs: meta.mtimeMs, size: meta.size }
      return
    }
    this.files.set(filePath, {
      timer: null,
      lastOwn,
      lastSeen: { mtimeMs: meta.mtimeMs, size: meta.size },
      fileWatcher: null
    })
  }

  watch(filePath: string): void {
    const existing = this.files.get(filePath)
    if (!existing) {
      this.files.set(filePath, { timer: null, lastOwn: null, lastSeen: null, fileWatcher: null })
    }
    if (isUncPath(filePath)) {
      this.watchUncFile(filePath)
      return
    }
    if (this.dirHas(filePath)) return
    const dir = dirname(filePath)
    const dirWatch = this.dirs.get(dir)
    if (dirWatch) {
      dirWatch.files.add(filePath)
      return
    }
    try {
      const watcher = watch(dir, (_event, filename) => {
        this.onDirEvent(dir, filename?.toString() ?? null)
      })
      watcher.on('error', () => this.dropDir(dir))
      this.dirs.set(dir, { watcher, files: new Set([filePath]) })
    } catch {
      /* 監視できない場所は黙ってスキップ */
    }
  }

  unwatch(filePath: string): void {
    const meta = this.files.get(filePath)
    if (meta?.timer) clearTimeout(meta.timer)
    meta?.fileWatcher?.close()
    this.files.delete(filePath)
    const dir = dirname(filePath)
    const entry = this.dirs.get(dir)
    if (!entry) return
    entry.files.delete(filePath)
    if (entry.files.size === 0) this.dropDir(dir)
  }

  dispose(): void {
    for (const [filePath, meta] of this.files) {
      if (meta.timer) clearTimeout(meta.timer)
      meta.fileWatcher?.close()
      this.files.delete(filePath)
    }
    for (const dir of [...this.dirs.keys()]) this.dropDir(dir)
  }

  private watchUncFile(filePath: string): void {
    const meta = this.files.get(filePath)
    if (!meta || meta.fileWatcher) return
    try {
      const watcher = watch(filePath, () => this.schedule(filePath))
      watcher.on('error', () => {
        meta.fileWatcher?.close()
        meta.fileWatcher = null
        setTimeout(() => {
          if (this.files.has(filePath)) this.watchUncFile(filePath)
        }, 800)
      })
      meta.fileWatcher = watcher
    } catch {
      /* 監視できない場所は黙ってスキップ */
    }
  }

  private dirHas(filePath: string): boolean {
    return this.dirs.get(dirname(filePath))?.files.has(filePath) ?? false
  }

  private dropDir(dir: string): void {
    const entry = this.dirs.get(dir)
    if (!entry) return
    entry.watcher.close()
    this.dirs.delete(dir)
  }

  private onDirEvent(dir: string, filename: string | null): void {
    const entry = this.dirs.get(dir)
    if (!entry) return
    if (!filename) return
    if (filename.endsWith('.tmp')) return
    const name = filename.toLowerCase()
    for (const filePath of entry.files) {
      if (basename(filePath).toLowerCase() === name) this.schedule(filePath)
    }
  }

  private schedule(filePath: string): void {
    const meta = this.files.get(filePath)
    if (!meta) return
    if (meta.timer) clearTimeout(meta.timer)
    const wait = isUncPath(filePath) ? UNC_DEBOUNCE_MS : LOCAL_DEBOUNCE_MS
    meta.timer = setTimeout(() => {
      void this.emit(filePath)
    }, wait)
  }

  private async emit(filePath: string): Promise<void> {
    const meta = this.files.get(filePath)
    if (!meta) return
    try {
      const info = await stat(filePath)
      if (this.isOwnWrite(meta, filePath, info.mtimeMs, info.size)) return
      if (meta.lastSeen && meta.lastSeen.mtimeMs === info.mtimeMs && meta.lastSeen.size === info.size) {
        return
      }
      meta.lastSeen = { mtimeMs: info.mtimeMs, size: info.size }
      this.send(filePath, info.mtimeMs, info.size)
    } catch {
      /* 削除・移動は今は無視 */
    }
  }

  private isOwnWrite(meta: FileMeta, filePath: string, mtimeMs: number, size: number): boolean {
    const own = meta.lastOwn
    if (!own) return false
    if (own.mtimeMs === mtimeMs && own.size === size) return true
    const grace = isUncPath(filePath) ? UNC_OWN_GRACE_MS : LOCAL_OWN_GRACE_MS
    return Date.now() - own.at < grace
  }

  private send(filePath: string, mtimeMs: number, size: number): void {
    if (!this.win || this.win.isDestroyed() || this.win.webContents.isDestroyed()) return
    this.win.webContents.send('fs:changed', { path: filePath, mtimeMs, size })
  }
}
