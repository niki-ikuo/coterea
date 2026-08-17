import React from 'react'
import { createRoot } from 'react-dom/client'
import { AboutApp } from './AboutApp'
import { App } from './App'
import { SettingsApp } from './SettingsApp'

const view = new URLSearchParams(window.location.search).get('view')
const root = document.getElementById('root')

if (root) {
  if (view !== 'about' && view !== 'settings') {
    void import('./lib/editorReady').then((m) => m.preloadEditor())
  }
  createRoot(root).render(
    <React.StrictMode>
      {view === 'about' ? <AboutApp /> : view === 'settings' ? <SettingsApp /> : <App />}
    </React.StrictMode>
  )
}
