import type { ThemeId } from '../../../shared/theme'

export function applyUiTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme
}
