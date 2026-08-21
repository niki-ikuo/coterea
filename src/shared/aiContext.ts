/** 1ファイルあたりの本文上限（文字）。実文書で一括送信しないためのハードキャップ。 */
export const AI_CONTEXT_FILE_CHARS = 40_000
/** 1リクエストに載せる添付本文の合計上限（文字）。 */
export const AI_CONTEXT_TOTAL_CHARS = 120_000
/** 選択範囲テキストの上限（文字）。 */
export const AI_CONTEXT_SELECTION_CHARS = 12_000

export type ClippedText = {
  text: string
  truncated: boolean
  originalLength: number
  from: number
  to: number
}

export type OpenTabCatalogEntry = {
  id: string
  title: string
  language: string
  chars: number
}

/**
 * [from, to) のスライスを取り、さらに maxChars で切り詰める。
 * to 未指定は末尾まで。不正範囲は空文字。
 */
export function clipText(
  source: string,
  maxChars: number,
  from = 0,
  to?: number
): ClippedText {
  const start = Number.isFinite(from) && from > 0 ? Math.floor(from) : 0
  const endRaw = to == null ? source.length : Math.floor(to)
  const end = Math.min(source.length, Math.max(start, endRaw))
  const slice = source.slice(start, end)
  const limit = Number.isFinite(maxChars) && maxChars > 0 ? Math.floor(maxChars) : 0
  if (limit <= 0) {
    return { text: '', truncated: slice.length > 0, originalLength: source.length, from: start, to: start }
  }
  if (slice.length <= limit) {
    return {
      text: slice,
      truncated: start > 0 || end < source.length,
      originalLength: source.length,
      from: start,
      to: end
    }
  }
  return {
    text: slice.slice(0, limit),
    truncated: true,
    originalLength: source.length,
    from: start,
    to: start + limit
  }
}

/** 複数本文を1ファイル上限＋合計予算で切り詰める（先頭から消費）。 */
export function clipContextBodies(
  bodies: readonly string[],
  perFileMax = AI_CONTEXT_FILE_CHARS,
  totalMax = AI_CONTEXT_TOTAL_CHARS
): ClippedText[] {
  let remaining = Math.max(0, totalMax)
  return bodies.map((body) => {
    const max = Math.min(perFileMax, remaining)
    const clipped = clipText(body, max)
    remaining = Math.max(0, remaining - clipped.text.length)
    return clipped
  })
}

export function clipSelectionText(
  text: string,
  maxChars = AI_CONTEXT_SELECTION_CHARS
): ClippedText {
  return clipText(text, maxChars)
}

/** LLM / ツール応答用。切り詰め時は範囲と全文長を明示する。 */
export function withClipNotice(clipped: ClippedText): string {
  if (!clipped.truncated) return clipped.text
  const notice = `（文字 ${clipped.from}–${clipped.to} / 全文 ${clipped.originalLength}。続きは範囲を指定して読んでください）`
  return clipped.text ? `${clipped.text}\n${notice}` : notice
}

export function formatOpenTabsCatalog(
  tabs: readonly OpenTabCatalogEntry[],
  bodyTabIds: ReadonlySet<string> = new Set()
): string {
  if (tabs.length === 0) {
    return ['[開いているタブ]', '（なし）'].join('\n')
  }
  const lines = tabs.map((tab) => {
    const loaded = bodyTabIds.has(tab.id) ? '本文は上記' : '必要なら read_tab'
    return `- ${tab.title} (id: ${tab.id}, ${tab.language}, ${tab.chars} chars) ← ${loaded}`
  })
  return ['[開いているタブ]', ...lines].join('\n')
}
