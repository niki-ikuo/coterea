import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { defaultChatHistory, sanitizeChatHistory, type ChatHistoryFile } from '../shared/ai'

export class ChatHistoryStore {
  private data: ChatHistoryFile = defaultChatHistory()
  private loaded = false

  private path(): string {
    return join(app.getPath('userData'), 'chat-history.json')
  }

  async load(): Promise<ChatHistoryFile> {
    if (this.loaded) return this.data
    await mkdir(app.getPath('userData'), { recursive: true })
    try {
      const raw = JSON.parse(await readFile(this.path(), 'utf8')) as unknown
      this.data = sanitizeChatHistory(raw)
    } catch {
      this.data = defaultChatHistory()
    }
    this.loaded = true
    return this.data
  }

  async save(history: ChatHistoryFile): Promise<void> {
    this.data = sanitizeChatHistory(history)
    this.loaded = true
    await mkdir(app.getPath('userData'), { recursive: true })
    await writeFile(this.path(), JSON.stringify(this.data, null, 2), 'utf8')
  }
}
