import './styles.css'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { AboutApp } from './AboutApp'
import { App } from './App'
import { SettingsApp } from './SettingsApp'
import { setupMonaco } from './lib/monacoEnv'

const view = new URLSearchParams(window.location.search).get('view')
const isAux = view === 'about' || view === 'settings'

const root = document.getElementById('root')
if (root) {
  if (!isAux) setupMonaco()
  createRoot(root).render(
    <React.StrictMode>
      {view === 'about' ? <AboutApp /> : view === 'settings' ? <SettingsApp /> : <App />}
    </React.StrictMode>
  )
}
