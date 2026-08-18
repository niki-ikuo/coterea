import React from 'react'
import { createRoot } from 'react-dom/client'
import { AboutApp } from './AboutApp'
import { App } from './App'
import { HelpApp } from './HelpApp'
import { HelpAskApp } from './HelpAskApp'

const view = new URLSearchParams(window.location.search).get('view')
const root = document.getElementById('root')
const aux = view === 'about' || view === 'help' || view === 'ai-help'

if (root) {
  if (!aux) {
    void import('./lib/editorReady').then((m) => m.preloadEditor())
  }
  const page =
    view === 'about' ? <AboutApp /> : view === 'help' ? <HelpApp /> : view === 'ai-help' ? <HelpAskApp /> : <App />
  createRoot(root).render(<React.StrictMode>{page}</React.StrictMode>)
}
