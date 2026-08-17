import { randomBytes } from 'crypto'
import { dialog, type BrowserWindow } from 'electron'
import { basename, dirname, join } from 'path'
import { copyFile, readFile, rename, stat, unlink, writeFile } from 'fs/promises'
import {
  FILE_LINE_WARN,
  FILE_SIZE_WARN_BYTES,
  type ExternalChangeDecision,
  type ReadFileResult,
  type SaveResult,
  type WriteFileResult
} from '../shared/types'
import { DEFAULT_ENCODING, type EncodingId } from '../shared/encoding'
import { decodeBuffer, detectEncoding, encodeText } from './encoding'
import { resolveFileIds } from './fileIdentity'
import { OPEN_FILTERS } from '../shared/fileTypes'

export async function openFiles(win: BrowserWindow): Promise<string[]> {
  const result = await dialog.showOpenDialog(win, {
    title: 'ファイルを開く',
    properties: ['openFile', 'multiSelections'],
    filters: OPEN_FILTERS
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

export async function peekTextFile(filePath: string, encoding?: EncodingId): Promise<string | null> {
  try {
    const buf = await readFile(filePath)
    const used = encoding ?? detectEncoding(buf)
    return decodeBuffer(buf, used)
  } catch {
    return null
  }
}

export async function statTextFile(filePath: string): Promise<WriteFileResult | null> {
  try {
    const info = await stat(filePath)
    return { mtimeMs: info.mtimeMs, size: info.size }
  } catch {
    return null
  }
}

export async function writeTextFile(
  filePath: string,
  content: string,
  encoding: EncodingId = DEFAULT_ENCODING
): Promise<WriteFileResult> {
  const buf = encodeText(content, encoding)
  const dir = dirname(filePath)
  const tmp = join(dir, `.${basename(filePath)}.${randomBytes(6).toString('hex')}.tmp`)
  await writeFile(tmp, buf)
  try {
    try {
      await rename(tmp, filePath)
    } catch {
      await copyFile(tmp, filePath)
      await unlink(tmp)
    }
  } catch (err) {
    await unlink(tmp).catch(() => undefined)
    throw err
  }
  const info = await stat(filePath)
  return { mtimeMs: info.mtimeMs, size: info.size }
}

export async function saveAs(win: BrowserWindow, suggestedName?: string): Promise<SaveResult> {
  const result = await dialog.showSaveDialog(win, {
    title: '名前を付けて保存',
    defaultPath: suggestedName,
    filters: OPEN_FILTERS
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

export async function confirmExternalChange(
  win: BrowserWindow,
  filePath: string
): Promise<ExternalChangeDecision> {
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'ディスク上の変更',
    message: 'このファイルはエディタの外で変更されました。',
    detail: filePath,
    buttons: ['取り込む', '無視する'],
    defaultId: 0,
    cancelId: 1
  })
  return result.response === 0 ? 'reload' : 'ignore'
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
