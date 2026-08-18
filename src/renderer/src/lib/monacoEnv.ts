import './monacoWorkerEnv'
import 'monaco-editor/esm/vs/editor/editor.all.js'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import type { ThemeId } from '../../../shared/theme'

export {
  isMarkdownLanguage,
  languageFromPath,
  languageLabel,
  titleFromPath
} from './fileMeta'

export { monaco }

let languages: Promise<void> | null = null

const MONACO_THEME: Record<ThemeId, 'vs' | 'vs-dark' | 'hc-black' | 'hc-light'> = {
  'win-light': 'vs',
  'win-dark': 'vs-dark',
  'hc-light': 'hc-light',
  'hc-dark': 'hc-black',
  'warm-light': 'vs',
  'warm-dark': 'vs-dark'
}

function loadLanguages(): Promise<void> {
  if (!languages) {
    languages = import('monaco-editor/esm/vs/basic-languages/monaco.contribution.js').then(() => {
      for (const model of monaco.editor.getModels()) {
        monaco.editor.setModelLanguage(model, model.getLanguageId())
      }
    })
  }
  return languages
}

export function setupMonaco(): void {
  void loadLanguages()
}

export function preloadMonacoLanguages(): Promise<void> {
  return loadLanguages()
}

export function monacoThemeOf(theme: ThemeId): string {
  return MONACO_THEME[theme]
}

export function applyMonacoTheme(theme: ThemeId): void {
  monaco.editor.setTheme(monacoThemeOf(theme))
}
