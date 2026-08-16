export type ThemeId =
  | 'win-light'
  | 'win-dark'
  | 'hc-light'
  | 'hc-dark'
  | 'warm-light'
  | 'warm-dark'

export const DEFAULT_THEME: ThemeId = 'win-light'

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'win-light', label: 'Windows ライト' },
  { id: 'win-dark', label: 'Windows ダーク' },
  { id: 'hc-light', label: 'ハイコントラスト ライト' },
  { id: 'hc-dark', label: 'ハイコントラスト ダーク' },
  { id: 'warm-light', label: 'コテリア ライト' },
  { id: 'warm-dark', label: 'コテリア ダーク' }
]

export const THEME_WINDOW_BG: Record<ThemeId, string> = {
  'win-light': '#f3f3f3',
  'win-dark': '#202020',
  'hc-light': '#ffffff',
  'hc-dark': '#000000',
  'warm-light': '#f7f4ef',
  'warm-dark': '#1c1917'
}

const IDS = new Set<string>(THEMES.map((t) => t.id))

export function parseTheme(value: unknown): ThemeId {
  if (value === 'light') return 'win-light'
  if (value === 'dark') return 'win-dark'
  if (typeof value === 'string' && IDS.has(value)) return value as ThemeId
  return DEFAULT_THEME
}
