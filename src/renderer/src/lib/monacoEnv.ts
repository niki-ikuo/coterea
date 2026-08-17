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

let setup = false
let languages: Promise<void> | null = null

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
  if (setup) return
  setup = true

  monaco.editor.defineTheme('coterea-win-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#1a1a1a',
      'editorLineNumber.foreground': '#767676',
      'editorCursor.foreground': '#0078d4',
      'editor.selectionBackground': '#cce8ff',
      'editor.inactiveSelectionBackground': '#e5e5e5',
      'editor.lineHighlightBackground': '#f3f3f3'
    }
  })
  monaco.editor.defineTheme('coterea-win-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1c1c1c',
      'editor.foreground': '#ffffff',
      'editorLineNumber.foreground': '#9d9d9d',
      'editorCursor.foreground': '#60cdff',
      'editor.selectionBackground': '#264f78',
      'editor.inactiveSelectionBackground': '#3f3f3f',
      'editor.lineHighlightBackground': '#2a2a2a'
    }
  })
  monaco.editor.defineTheme('coterea-hc-light', {
    base: 'hc-light',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#000000',
      'editorLineNumber.foreground': '#000000',
      'editorCursor.foreground': '#000000',
      'editor.selectionBackground': '#000000',
      'editor.selectionForeground': '#ffffff',
      'editor.lineHighlightBorder': '#000000'
    }
  })
  monaco.editor.defineTheme('coterea-hc-dark', {
    base: 'hc-black',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#000000',
      'editor.foreground': '#ffffff',
      'editorLineNumber.foreground': '#ffffff',
      'editorCursor.foreground': '#ffff00',
      'editor.selectionBackground': '#ffff00',
      'editor.selectionForeground': '#000000',
      'editor.lineHighlightBorder': '#ffffff'
    }
  })
  monaco.editor.defineTheme('coterea-warm-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#f7f4ef',
      'editor.foreground': '#292524',
      'editorLineNumber.foreground': '#a8a29e',
      'editorCursor.foreground': '#9a6b3f',
      'editor.selectionBackground': '#e7d5c4',
      'editor.inactiveSelectionBackground': '#efe6dc',
      'editor.lineHighlightBackground': '#efeae3'
    }
  })
  monaco.editor.defineTheme('coterea-warm-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1c1917',
      'editor.foreground': '#f5f0e8',
      'editorLineNumber.foreground': '#78716c',
      'editorCursor.foreground': '#e7c9a5',
      'editor.selectionBackground': '#6b5344',
      'editor.inactiveSelectionBackground': '#4a3f38',
      'editor.selectionHighlightBackground': '#6b5344',
      'editor.lineHighlightBackground': '#292524'
    }
  })
}

export function preloadMonacoLanguages(): Promise<void> {
  return loadLanguages()
}

export function monacoThemeOf(theme: ThemeId): string {
  return `coterea-${theme}`
}

export function applyMonacoTheme(theme: ThemeId): void {
  monaco.editor.setTheme(monacoThemeOf(theme))
}
