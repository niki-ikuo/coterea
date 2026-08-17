import type { Environment } from 'monaco-editor'

const env: Environment = {
  getWorker(): Promise<Worker> {
    return import('monaco-editor/esm/vs/editor/editor.worker?worker').then((m) => new m.default())
  }
}

;(globalThis as typeof globalThis & { MonacoEnvironment: Environment }).MonacoEnvironment = env
