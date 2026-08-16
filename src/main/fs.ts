import { dialog, type BrowserWindow } from 'electron'
import { readFile, writeFile, stat } from 'fs/promises'
import { FILE_LINE_WARN, FILE_SIZE_WARN_BYTES, type ReadFileResult, type SaveResult } from '../shared/types'
import { DEFAULT_ENCODING, type EncodingId } from '../shared/encoding'
import { decodeBuffer, detectEncoding, encodeText } from './encoding'
import { resolveFileIds } from './fileIdentity'

const FILTERS = [
  { name: 'テキスト', extensions: ['txt', 'md', 'markdown'] },
  { name: 'コード', extensions: ['json', 'csv', 'html', 'css', 'js', 'ts', 'py'] },
  { name: 'すべてのファイル', extensions: ['*'] }
]

export async function openFiles(win: BrowserWindow): Promise<string[]> {
  const result = await dialog.showOpenDialog(win, {
    title: 'ファイルを開く',
    properties: ['openFile', 'multiSelections'],
    filters: FILTERS
  })
  return result.canceled ? [] : result.filePaths
}

export async function readTextFile(filePath: string, encoding?: EncodingId): Promise<ReadFileResult> {
  const info = await stat(filePath)
  const buf = await readFile(filePath)
  const detected = detectEncoding(buf)
  const used = encoding ?? detected
  const content = decodeBuffer(buf, used)
  const lines = content.length === 0 ? 0 : content.split(/\r?\n/).length
  return {
    path: filePath,
    content,
    bytes: info.size,
    lines,
    tooLarge: info.size > FILE_SIZE_WARN_BYTES || lines > FILE_LINE_WARN,
    encoding: used,
    detectedEncoding: detected,
    fileIds: await resolveFileIds(filePath)
  }
}

export async function writeTextFile(
  filePath: string,
  content: string,
  encoding: EncodingId = DEFAULT_ENCODING
): Promise<void> {
  await writeFile(filePath, encodeText(content, encoding))
}

export async function saveAs(win: BrowserWindow, suggestedName?: string): Promise<SaveResult> {
  const result = await dialog.showSaveDialog(win, {
    title: '名前を付けて保存',
    defaultPath: suggestedName,
    filters: FILTERS
  })
  return { canceled: result.canceled, path: result.filePath ?? null }
}

export async function confirmUnsaved(win: BrowserWindow, names: string[]): Promise<'save' | 'discard' | 'cancel'> {
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    title: '未保存の変更',
    message: '保存していない変更があります。',
    detail: names.join('\n'),
    buttons: ['保存', '保存しない', 'キャンセル'],
    defaultId: 0,
    cancelId: 2
  })
  if (result.response === 0) return 'save'
  if (result.response === 1) return 'discard'
  return 'cancel'
}

export async function warnLargeFile(win: BrowserWindow, filePath: string): Promise<boolean> {
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    title: '大きなファイル',
    message: 'このファイルは動作保証の上限（2MB / 約10万行）を超えています。',
    detail: filePath,
    buttons: ['開く', 'キャンセル'],
    defaultId: 1,
    cancelId: 1
  })
  return result.response === 0
}
