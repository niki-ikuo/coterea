export const APP_MENUS = [
  { id: 'file', label: 'ファイル', key: 'F' },
  { id: 'edit', label: '編集', key: 'E' },
  { id: 'view', label: '表示', key: 'V' },
  { id: 'help', label: 'ヘルプ', key: 'H' }
] as const

export type AppMenuLabel = (typeof APP_MENUS)[number]['label']

export function menuLabelForKey(input: { code?: string; key?: string }): AppMenuLabel | null {
  const code = input.code ?? ''
  if (!/^Key[FEVH]$/i.test(code)) return null
  const letter = code.slice(3).toUpperCase()
  return APP_MENUS.find((item) => item.key === letter)?.label ?? null
}
