import * as monaco from 'monaco-editor'
import type { Environment } from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

export function setupMonaco(): void {
  const env: Environment = {
    getWorker(_workerId: string, label: string): Worker {
      if (label === 'json') return new JsonWorker()
      if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
      if (label === 'typescript' || label === 'javascript') return new TsWorker()
      return new EditorWorker()
    }
  }
  ;(globalThis as typeof globalThis & { MonacoEnvironment: Environment }).MonacoEnvironment = env

  monaco.editor.defineTheme('coterea', {
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

export function languageFromPath(filePath: string | null | undefined): string {
  if (!filePath) return 'plaintext'
  const ext = filePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'md':
    case 'markdown':
      return 'markdown'
    case 'json':
      return 'json'
    case 'csv':
    case 'txt':
      return 'plaintext'
    case 'html':
    case 'htm':
      return 'html'
    case 'css':
      return 'css'
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript'
    case 'ts':
      return 'typescript'
    case 'py':
      return 'python'
    default:
      return 'plaintext'
  }
}

export function titleFromPath(filePath: string | null, fallback = '無題'): string {
  if (!filePath) return fallback
  return filePath.split(/[/\\]/).pop() || fallback
}
