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

export const TITLEBAR_HEIGHT = 36

export const THEME_WINDOW_BG: Record<ThemeId, string> = {
  'win-light': '#f3f3f3',
  'win-dark': '#202020',
  'hc-light': '#ffffff',
  'hc-dark': '#000000',
  'warm-light': '#f7f4ef',
  'warm-dark': '#1c1917'
}

export const THEME_TITLEBAR_OVERLAY: Record<ThemeId, { color: string; symbolColor: string }> = {
  'win-light': { color: '#f3f3f3', symbolColor: '#1a1a1a' },
  'win-dark': { color: '#202020', symbolColor: '#ffffff' },
  'hc-light': { color: '#ffffff', symbolColor: '#000000' },
  'hc-dark': { color: '#000000', symbolColor: '#ffffff' },
  'warm-light': { color: '#efeae3', symbolColor: '#292524' },
  'warm-dark': { color: '#161311', symbolColor: '#f5f0e8' }
}

const IDS = new Set<string>(THEMES.map((t) => t.id))

export function isDarkTheme(theme: ThemeId): boolean {
  return theme === 'win-dark' || theme === 'hc-dark' || theme === 'warm-dark'
}

export function parseTheme(value: unknown): ThemeId {
  if (value === 'light') return 'win-light'
  if (value === 'dark') return 'win-dark'
  if (typeof value === 'string' && IDS.has(value)) return value as ThemeId
  return DEFAULT_THEME
}
