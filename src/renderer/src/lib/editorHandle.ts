import type * as monaco from 'monaco-editor'

let current: monaco.editor.IStandaloneCodeEditor | null = null

export function setActiveEditor(editor: monaco.editor.IStandaloneCodeEditor | null): void {
  current = editor
}

export function getActiveEditor(): monaco.editor.IStandaloneCodeEditor | null {
  return current
}
