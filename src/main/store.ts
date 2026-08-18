import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { userInfo } from 'os'
import type { AppSettings } from '../shared/types'
import { parseEditorSession, type EditorSession } from '../shared/session'
import { DEFAULT_THEME, parseTheme } from '../shared/theme'
import {
  AI_DEFAULT_MAX_STEPS,
  AI_DEFAULT_MAX_TOKENS,
  AI_DEFAULT_MODEL,
  AI_DEFAULT_TEMPERATURE,
  clampMaxSteps,
  clampMaxTokens,
  clampTemperature,
  parseProviderId,
  providerById
} from '../shared/ai'

const MAX_RECENT = 12

type Store = {
  settings: AppSettings
  recentFiles: string[]
  session: EditorSession
}

function defaultStore(): Store {
  return {
    settings: {
      displayName: userInfo().username || 'User',
      theme: DEFAULT_THEME,
      collabPaneVisible: false,
        collabLanNoticeShown: false,
        providerId: 'openai',
        apiBaseUrl: providerById('openai').baseUrl,
        model: AI_DEFAULT_MODEL,
        temperature: AI_DEFAULT_TEMPERATURE,
        maxTokens: AI_DEFAULT_MAX_TOKENS,
        maxAgentSteps: AI_DEFAULT_MAX_STEPS
      },
    recentFiles: [],
    session: { tabs: [], active: 0 }
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

  private sessionPath(): string {
    return join(this.dir(), 'session.json')
  }

  async load(): Promise<void> {
    if (this.loaded) return
    await mkdir(this.dir(), { recursive: true })
    try {
      const raw = JSON.parse(await readFile(this.settingsPath(), 'utf8')) as Partial<AppSettings>
      this.data.settings = {
        ...this.data.settings,
        ...raw,
        theme: parseTheme(raw.theme),
        collabPaneVisible: raw.collabPaneVisible === true,
        collabLanNoticeShown: raw.collabLanNoticeShown === true,
        providerId: parseProviderId(raw.providerId),
        apiBaseUrl: typeof raw.apiBaseUrl === 'string' ? raw.apiBaseUrl : providerById(parseProviderId(raw.providerId)).baseUrl,
        model: typeof raw.model === 'string' && raw.model.trim() ? raw.model : AI_DEFAULT_MODEL,
        temperature: clampTemperature(raw.temperature),
        maxTokens: clampMaxTokens(raw.maxTokens),
        maxAgentSteps: clampMaxSteps(raw.maxAgentSteps)
      }
    } catch {
      /* first run */
    }
    try {
      const recent = JSON.parse(await readFile(this.recentPath(), 'utf8')) as string[]
      this.data.recentFiles = Array.isArray(recent) ? recent : []
    } catch {
      /* first run */
    }
    try {
      this.data.session = parseEditorSession(JSON.parse(await readFile(this.sessionPath(), 'utf8')))
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
    this.data.settings = {
      ...this.data.settings,
      ...patch,
      ...(patch.theme ? { theme: parseTheme(patch.theme) } : {}),
      ...(typeof patch.collabPaneVisible === 'boolean'
        ? { collabPaneVisible: patch.collabPaneVisible }
        : {}),
      ...(typeof patch.collabLanNoticeShown === 'boolean'
        ? { collabLanNoticeShown: patch.collabLanNoticeShown }
        : {}),
      ...(patch.providerId ? { providerId: parseProviderId(patch.providerId) } : {}),
      ...(typeof patch.apiBaseUrl === 'string' ? { apiBaseUrl: patch.apiBaseUrl } : {}),
      ...(typeof patch.model === 'string' && patch.model.trim() ? { model: patch.model.trim() } : {}),
      ...(patch.temperature != null ? { temperature: clampTemperature(patch.temperature) } : {}),
      ...(patch.maxTokens != null ? { maxTokens: clampMaxTokens(patch.maxTokens) } : {}),
      ...(patch.maxAgentSteps != null ? { maxAgentSteps: clampMaxSteps(patch.maxAgentSteps) } : {})
    }
    await writeFile(this.settingsPath(), JSON.stringify(this.data.settings, null, 2), 'utf8')
    return this.getSettings()
  }

  getSession(): EditorSession {
    return {
      tabs: [...this.data.session.tabs],
      active: this.data.session.active
    }
  }

  async setSession(raw: unknown): Promise<EditorSession> {
    await this.load()
    this.data.session = parseEditorSession(raw)
    await writeFile(this.sessionPath(), JSON.stringify(this.data.session, null, 2), 'utf8')
    return this.getSession()
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
