import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.js'

export type LineSelectionRange = {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

/** 行番号ガターのドラッグ選択用の Selection 範囲を計算する。 */
export function lineSelectionRange(
  lineCount: number,
  endLineMaxColumn: number,
  fromLine: number,
  toLine: number
): LineSelectionRange {
  const start = Math.min(fromLine, toLine)
  const end = Math.max(fromLine, toLine)
  const clampedEnd = Math.min(Math.max(end, 1), lineCount)
  const clampedStart = Math.min(Math.max(start, 1), lineCount)
  if (clampedEnd >= lineCount) {
    return {
      startLineNumber: clampedStart,
      startColumn: 1,
      endLineNumber: lineCount,
      endColumn: endLineMaxColumn
    }
  }
  return {
    startLineNumber: clampedStart,
    startColumn: 1,
    endLineNumber: clampedEnd + 1,
    endColumn: 1
  }
}

export function applyLineNumberSelection(
  monaco: typeof Monaco,
  editor: Monaco.editor.IStandaloneCodeEditor,
  fromLine: number,
  toLine: number
): void {
  const model = editor.getModel()
  if (!model) return
  const range = lineSelectionRange(
    model.getLineCount(),
    model.getLineMaxColumn(model.getLineCount()),
    fromLine,
    toLine
  )
  editor.setSelection(
    new monaco.Selection(
      range.startLineNumber,
      range.startColumn,
      range.endLineNumber,
      range.endColumn
    )
  )
  editor.revealLineInCenterIfOutsideViewport(Math.max(fromLine, toLine))
}

export function isLineNumberGutterTarget(
  monaco: typeof Monaco,
  target: Monaco.editor.IMouseTarget
): number | null {
  if (target.type !== monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) return null
  const line = target.position?.lineNumber
  return typeof line === 'number' && line > 0 ? line : null
}
