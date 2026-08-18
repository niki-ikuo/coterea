export type DiffLine = { type: 'eq' | 'del' | 'add'; text: string }

export function splitLines(text: string): string[] {
  if (text.length === 0) return ['']
  return text.split('\n')
}

/** Myers 差分の簡易版。行単位のプレビュー用。 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before)
  const b = splitLines(after)
  const n = a.length
  const m = b.length
  const max = n + m
  const v = new Int32Array(2 * max + 1)
  const traces: Int32Array[] = []
  let done = false
  for (let d = 0; d <= max; d++) {
    traces.push(Int32Array.from(v))
    for (let k = -d; k <= d; k += 2) {
      const kIndex = k + max
      let x: number
      if (k === -d || (k !== d && v[kIndex - 1] < v[kIndex + 1])) {
        x = v[kIndex + 1]
      } else {
        x = v[kIndex - 1] + 1
      }
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x += 1
        y += 1
      }
      v[kIndex] = x
      if (x >= n && y >= m) {
        done = true
        break
      }
    }
    if (done) {
      return backtrack(a, b, traces, max)
    }
  }
  return [{ type: 'eq', text: after }]
}

function backtrack(a: string[], b: string[], traces: Int32Array[], max: number): DiffLine[] {
  const out: DiffLine[] = []
  let x = a.length
  let y = b.length
  for (let d = traces.length - 1; d >= 0; d--) {
    const v = traces[d]
    const k = x - y
    const kIndex = k + max
    let prevK: number
    if (k === -d || (k !== d && v[kIndex - 1] < v[kIndex + 1])) {
      prevK = k + 1
    } else {
      prevK = k - 1
    }
    const prevX = v[prevK + max]
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      x -= 1
      y -= 1
      out.push({ type: 'eq', text: a[x] })
    }
    if (d === 0) break
    if (x > prevX) {
      x -= 1
      out.push({ type: 'del', text: a[x] })
    } else if (y > prevY) {
      y -= 1
      out.push({ type: 'add', text: b[y] })
    }
  }
  out.reverse()
  return out
}

export function previewTexts(proposal: {
  mode: 'replace_all' | 'replace_range'
  baseText: string
  text: string
  from?: number
  to?: number
  rangeBase?: string
}): { before: string; after: string } {
  if (proposal.mode === 'replace_range') {
    const from = proposal.from ?? 0
    const to = proposal.to ?? 0
    const beforeSlice = proposal.rangeBase ?? proposal.baseText.slice(from, to)
    return { before: beforeSlice, after: proposal.text }
  }
  return { before: proposal.baseText, after: proposal.text }
}
