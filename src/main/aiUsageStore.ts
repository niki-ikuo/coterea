import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  addLlmUsage,
  emptyLlmUsage,
  localMonthStamp,
  normalizeResetDate,
  normalizeResetDayOfMonth,
  parseLlmUsageStats,
  type LlmUsageDelta,
  type LlmUsageStats
} from '../shared/llmUsage'

type UsageFile = {
  stats: LlmUsageStats
  autoResetAppliedFor: string | null
}

export class AiUsageStore {
  private data: LlmUsageStats = emptyLlmUsage()
  private autoResetAppliedFor: string | null = null
  private loaded = false

  private path(): string {
    return join(app.getPath('userData'), 'ai-usage.json')
  }

  async load(): Promise<void> {
    if (this.loaded) return
    await mkdir(app.getPath('userData'), { recursive: true })
    try {
      const parsed = JSON.parse(await readFile(this.path(), 'utf8')) as unknown
      const legacy = parseLlmUsageStats(parsed)
      if (legacy.requestCount > 0 || legacy.promptTokens > 0 || legacy.completionTokens > 0 || legacy.totalTokens > 0) {
        this.data = legacy
      } else if (parsed && typeof parsed === 'object') {
        const o = parsed as { stats?: unknown; autoResetAppliedFor?: unknown }
        this.data = parseLlmUsageStats(o.stats)
        this.autoResetAppliedFor = normalizeResetDate(o.autoResetAppliedFor)
      } else {
        this.data = emptyLlmUsage()
      }
    } catch {
      this.data = emptyLlmUsage()
    }
    this.loaded = true
  }

  get(): LlmUsageStats {
    return { ...this.data }
  }

  async maybeAutoReset(resetDayOfMonth: number | undefined): Promise<{ changed: boolean; stats: LlmUsageStats }> {
    await this.load()
    const day = normalizeResetDayOfMonth(resetDayOfMonth)
    if (!day) return { changed: false, stats: this.get() }
    const now = new Date()
    if (now.getDate() < day) return { changed: false, stats: this.get() }
    const thisMonth = localMonthStamp(now)
    if (this.autoResetAppliedFor === thisMonth) return { changed: false, stats: this.get() }
    this.data = emptyLlmUsage()
    this.autoResetAppliedFor = thisMonth
    await this.save()
    return { changed: true, stats: this.get() }
  }

  async record(delta: LlmUsageDelta): Promise<LlmUsageStats> {
    await this.load()
    this.data = addLlmUsage(this.data, delta)
    await this.save()
    return this.get()
  }

  async reset(): Promise<LlmUsageStats> {
    await this.load()
    this.data = emptyLlmUsage()
    await this.save()
    return this.get()
  }

  private async save(): Promise<void> {
    const out: UsageFile = { stats: this.data, autoResetAppliedFor: this.autoResetAppliedFor }
    await writeFile(this.path(), JSON.stringify(out, null, 2), 'utf8')
  }
}
