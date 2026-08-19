import { describe, expect, it } from 'vitest'
import {
  addLlmUsage,
  emptyLlmUsage,
  formatTokenCountCompact,
  formatTokenCountFull,
  localDateStamp,
  localMonthStamp,
  normalizeResetDayOfMonth,
  normalizeResetDate,
  parseLlmUsageStats
} from './llmUsage'
import { parseSseUsage } from './openaiSse'

describe('llmUsage', () => {
  it('parses stored stats safely', () => {
    expect(parseLlmUsageStats({ requestCount: 3, promptTokens: 10, completionTokens: 5, totalTokens: 15 })).toEqual({
      requestCount: 3,
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15
    })
    expect(parseLlmUsageStats(null)).toEqual(emptyLlmUsage())
  })

  it('adds request and token deltas', () => {
    const next = addLlmUsage(emptyLlmUsage(), { promptTokens: 100, completionTokens: 40, totalTokens: 140 })
    expect(next).toEqual({
      requestCount: 1,
      promptTokens: 100,
      completionTokens: 40,
      totalTokens: 140
    })
  })

  it('counts request even without token usage', () => {
    const next = addLlmUsage(emptyLlmUsage(), {})
    expect(next.requestCount).toBe(1)
    expect(next.totalTokens).toBe(0)
  })

  it('formats compact token counts', () => {
    expect(formatTokenCountCompact(842)).toBe('842')
    expect(formatTokenCountCompact(12500)).toBe('12.5k')
    expect(formatTokenCountFull(12500)).toBe('12,500')
  })

  it('normalizes reset date safely', () => {
    expect(normalizeResetDate('2026-08-19')).toBe('2026-08-19')
    expect(normalizeResetDate('2026-02-31')).toBeNull()
    expect(normalizeResetDate('')).toBeNull()
  })

  it('builds local date stamp', () => {
    expect(localDateStamp(new Date(2026, 7, 19, 23, 59, 59))).toBe('2026-08-19')
  })

  it('normalizes monthly reset day safely', () => {
    expect(normalizeResetDayOfMonth(15)).toBe(15)
    expect(normalizeResetDayOfMonth('31')).toBe(31)
    expect(normalizeResetDayOfMonth(0)).toBeNull()
    expect(normalizeResetDayOfMonth(32)).toBeNull()
  })

  it('builds local month stamp', () => {
    expect(localMonthStamp(new Date(2026, 7, 19, 23, 59, 59))).toBe('2026-08')
  })
})

describe('parseSseUsage', () => {
  it('reads OpenAI stream usage chunk', () => {
    expect(
      parseSseUsage({
        choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
      })
    ).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 })
  })

  it('returns null when usage is missing', () => {
    expect(parseSseUsage({ choices: [{ delta: { content: 'hi' } }] })).toBeNull()
  })
})
