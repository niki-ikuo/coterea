import { useAppStore } from '../store'
import type { ThemeId } from '../../../shared/theme'
import type * as Docs from './docs'

let loading: Promise<typeof Docs> | null = null

export function preloadEditor(): Promise<typeof Docs> {
  if (!loading) {
    loading = import('./monacoEnv').then(async (env) => {
      env.setupMonaco()
      env.applyMonacoTheme(useAppStore.getState().theme)
      return import('./docs')
    })
  }
  return loading
}

export async function applyLoadedMonacoTheme(theme: ThemeId): Promise<void> {
  await preloadEditor()
  const env = await import('./monacoEnv')
  env.applyMonacoTheme(theme)
}
