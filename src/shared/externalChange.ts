export function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/** 共同編集の保存エコーや、自端末の未保存編集を外部変更ダイアログにしない。 */
export function shouldPromptExternalChange(input: {
  diskStatus: 'match' | 'differ' | 'unknown'
  disk: string | null
  editor: string
  lastSaved: string | null | undefined
  stillSaving: boolean
}): boolean {
  if (input.stillSaving) return false
  if (input.diskStatus !== 'differ' || input.disk == null) return false
  const disk = normalizeText(input.disk)
  if (disk === normalizeText(input.editor)) return false
  if (input.lastSaved != null && disk === normalizeText(input.lastSaved)) return false
  return true
}
