import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { userInfo } from 'os'
import type { AppSettings } from '../shared/types'

const MAX_RECENT = 12

type Store = {
  settings: AppSettings
  recentFiles: string[]
}

function defaultStore(): Store {
  return {
    settings: { displayName: userInfo().username || 'User' },
    recentFiles: []
  }
}

export class AppStore {
  private data: Store = defaultStore()
  private loaded = false

  private dir(): string {
    return app.getPath('userData')
  }

  private settingsPath(): string {
    return join(this.dir(), 'settings.json')
  }

  private recentPath(): string {
    return join(this.dir(), 'recent-files.json')
  }

  async load(): Promise<void> {
    if (this.loaded) return
    await mkdir(this.dir(), { recursive: true })
    try {
      const raw = JSON.parse(await readFile(this.settingsPath(), 'utf8')) as Partial<AppSettings>
      this.data.settings = { ...this.data.settings, ...raw }
    } catch {
      /* first run */
    }
    try {
      const recent = JSON.parse(await readFile(this.recentPath(), 'utf8')) as string[]
      this.data.recentFiles = Array.isArray(recent) ? recent : []
    } catch {
      /* first run */
    }
    this.loaded = true
  }

  getSettings(): AppSettings {
    return { ...this.data.settings }
  }

  async setSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    await this.load()
    this.data.settings = { ...this.data.settings, ...patch }
    await writeFile(this.settingsPath(), JSON.stringify(this.data.settings, null, 2), 'utf8')
    return this.getSettings()
  }

  getRecent(): string[] {
    return [...this.data.recentFiles]
  }

  async addRecent(path: string): Promise<string[]> {
    await this.load()
    this.data.recentFiles = [path, ...this.data.recentFiles.filter((p) => p !== path)].slice(
      0,
      MAX_RECENT
    )
    await writeFile(this.recentPath(), JSON.stringify(this.data.recentFiles, null, 2), 'utf8')
    return this.getRecent()
  }
}
