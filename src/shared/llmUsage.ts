export type LlmUsageStats = {
  requestCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type LlmUsageDelta = {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export function emptyLlmUsage(): LlmUsageStats {
  return { requestCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }
}

export function parseLlmUsageStats(raw: unknown): LlmUsageStats {
  if (!raw || typeof raw !== 'object') return emptyLlmUsage()
  const o = raw as Record<string, unknown>
  return {
    requestCount: nonNegInt(o.requestCount),
    promptTokens: nonNegInt(o.promptTokens),
    completionTokens: nonNegInt(o.completionTokens),
    totalTokens: nonNegInt(o.totalTokens)
  }
}

function nonNegInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

export function addLlmUsage(stats: LlmUsageStats, delta: LlmUsageDelta, countRequest = true): LlmUsageStats {
  const promptTokens = stats.promptTokens + Math.max(0, delta.promptTokens ?? 0)
  const completionTokens = stats.completionTokens + Math.max(0, delta.completionTokens ?? 0)
  const addedTotal = delta.totalTokens ?? (delta.promptTokens ?? 0) + (delta.completionTokens ?? 0)
  return {
    requestCount: stats.requestCount + (countRequest ? 1 : 0),
    promptTokens,
    completionTokens,
    totalTokens: stats.totalTokens + Math.max(0, addedTotal)
  }
}

/** ステータスバー向けの短い表記（例: 842, 12.5k） */
export function formatTokenCountCompact(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) {
    const k = n / 1000
    if (k >= 100) return `${Math.round(k)}k`
    const rounded = Math.round(k * 10) / 10
    return Number.isInteger(rounded) ? `${rounded}k` : `${rounded.toFixed(1)}k`
  }
  const m = n / 1_000_000
  const rounded = Math.round(m * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}M` : `${rounded.toFixed(1)}M`
}

/** 設定画面向けの桁区切り表記 */
export function formatTokenCountFull(n: number): string {
  return n.toLocaleString('ja-JP')
}

/** YYYY-MM-DD を厳格に検証して返す。不正なら null。 */
export function normalizeResetDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const [y, m, d] = v.split('-').map((s) => Number(s))
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return v
}

/** ローカル日付を YYYY-MM-DD で返す。 */
export function localDateStamp(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 毎月リセット日（1-31）を検証して返す。不正なら null。 */
export function normalizeResetDayOfMonth(value: unknown): number | null {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value.trim())
        : NaN
  if (!Number.isInteger(n) || n < 1 || n > 31) return null
  return n
}

/** ローカル年月を YYYY-MM で返す。 */
export function localMonthStamp(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}
