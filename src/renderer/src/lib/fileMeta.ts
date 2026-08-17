import { languageFromFileName } from '../../../shared/fileTypes'

const LANGUAGE_LABELS: Record<string, string> = {
  plaintext: 'Plain Text',
  markdown: 'Markdown',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  less: 'Less',
  python: 'Python',
  powershell: 'PowerShell',
  bat: 'Batch',
  yaml: 'YAML',
  xml: 'XML',
  ini: 'Ini',
  shell: 'Shell'
}

export function isMarkdownLanguage(language: string): boolean {
  return language === 'markdown'
}

export function titleFromPath(filePath: string | null, fallback = '無題'): string {
  if (!filePath) return fallback
  return filePath.split(/[/\\]/).pop() || fallback
}

export function languageFromPath(filePath: string | null | undefined): string {
  if (!filePath) return 'plaintext'
  const base = filePath.split(/[/\\]/).pop() ?? ''
  return languageFromFileName(base) ?? 'plaintext'
}

export function languageLabel(language: string): string {
  return LANGUAGE_LABELS[language] ?? language
}
