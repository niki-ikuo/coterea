import { app, safeStorage } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'

export class SecretStore {
  private cached: string | null | undefined

  private path(): string {
    return join(app.getPath('userData'), 'secrets.bin')
  }

  async load(): Promise<string | null> {
    if (this.cached !== undefined) return this.cached
    try {
      const buf = await readFile(this.path())
      if (!safeStorage.isEncryptionAvailable()) {
        this.cached = buf.toString('utf8') || null
        return this.cached
      }
      this.cached = safeStorage.decryptString(buf)
      return this.cached
    } catch {
      this.cached = null
      return null
    }
  }

  async hasKey(): Promise<boolean> {
    const value = await this.load()
    return Boolean(value && value.trim())
  }

  async setKey(key: string): Promise<void> {
    await mkdir(app.getPath('userData'), { recursive: true })
    const trimmed = key.trim()
    if (!trimmed) {
      this.cached = null
      try {
        await writeFile(this.path(), Buffer.alloc(0))
      } catch {
        /* ignore */
      }
      return
    }
    this.cached = trimmed
    const payload = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(trimmed)
      : Buffer.from(trimmed, 'utf8')
    await writeFile(this.path(), payload)
  }
}
