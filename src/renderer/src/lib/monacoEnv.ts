import * as monaco from 'monaco-editor'
import type { Environment } from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import type { ThemeId } from '../../../shared/theme'

const EXTRA: Record<string, string> = {
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  cts: 'typescript',
  mts: 'typescript',
  json: 'json',
  jsonc: 'json',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  py: 'python',
  pyw: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  cs: 'csharp',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  rb: 'ruby',
  php: 'php',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ps1: 'powershell',
  psm1: 'powershell',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  lua: 'lua',
  r: 'r',
  dart: 'dart',
  proto: 'protobuf',
  graphql: 'graphql',
  gql: 'graphql',
  vue: 'html',
  svelte: 'html',
  astro: 'html',
  ini: 'ini',
  env: 'ini',
  conf: 'ini',
  toml: 'ini',
  bat: 'bat',
  cmd: 'bat',
  pl: 'perl',
  scala: 'scala',
  groovy: 'java',
  gradle: 'java',
  cmake: 'makefile',
  mk: 'makefile',
  txt: 'plaintext',
  csv: 'plaintext'
}

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

export function monacoThemeOf(theme: ThemeId): string {
  return `coterea-${theme}`
}

export function applyUiTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme
  monaco.editor.setTheme(monacoThemeOf(theme))
}

export function isMarkdownLanguage(language: string): boolean {
  return language === 'markdown'
}

export function languageFromPath(filePath: string | null | undefined): string {
  if (!filePath) return 'plaintext'
  const base = filePath.split(/[/\\]/).pop() ?? ''
  const lower = base.toLowerCase()
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return 'dockerfile'
  if (lower === 'makefile' || lower === 'gnumakefile') return 'makefile'
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : ''
  const mapped = EXTRA[ext]
  if (mapped) return mapped
  const dotted = ext ? `.${ext}` : ''
  for (const lang of monaco.languages.getLanguages()) {
    if (lang.filenames?.some((name) => name.toLowerCase() === lower)) return lang.id
    if (dotted && lang.extensions?.some((item) => item.toLowerCase() === dotted)) return lang.id
  }
  return 'plaintext'
}

export function languageLabel(language: string): string {
  const lang = monaco.languages.getLanguages().find((item) => item.id === language)
  return lang?.aliases?.[0] ?? language
}

export function titleFromPath(filePath: string | null, fallback = '無題'): string {
  if (!filePath) return fallback
  return filePath.split(/[/\\]/).pop() || fallback
}
