import type { CotereaApi } from '../shared/api'

declare global {
  interface Window {
    coterea: CotereaApi
  }
}

export {}
