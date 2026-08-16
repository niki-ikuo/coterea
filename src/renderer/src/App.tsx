import { useEffect, useRef, useState } from 'react'
import { EditorPane } from './components/EditorPane'
import { RightPane } from './components/RightPane'
import { StatusBar } from './components/StatusBar'
import { TabBar } from './components/TabBar'
import { TitleBar } from './components/TitleBar'
import { attachCollabListeners, enableCollab } from './lib/collab'
import { closeTab, createUntitled, cycleMdView, handleAppClose, openDialog, openPaths, openPathsFromShell, saveActive, setMdView, toggleCollabPane } from './lib/actions'
import { getTabDoc, setLocalUser } from './lib/docs'
import { applyUiTheme } from './lib/monacoEnv'
import { getActiveEditor } from './lib/editorHandle'
import { useAppStore } from './store'
import { parseTheme } from '../../shared/theme'

export function App(): React.JSX.Element {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const collabPaneVisible = useAppStore((s) => s.collabPaneVisible)
  const displayName = useAppStore((s) => s.displayName)
  const localColor = useAppStore((s) => s.collab.localColor)
  const [rightWidth, setRightWidth] = useState(35)
  const dragging = useRef(false)

  useEffect(() => {
    const offCollab = attachCollabListeners()
    const offOpenFiles = window.coterea.app.onOpenFiles((paths) => {
      void openPathsFromShell(paths)
    })
    const offSettings = window.coterea.settings.onChange((next) => {
      useAppStore.getState().setDisplayName(next.displayName)
      const applied = parseTheme(next.theme)
      useAppStore.getState().setTheme(applied)
      applyUiTheme(applied)
      void window.coterea.collab.setDisplayName(next.displayName)
    })
    void (async () => {
      const s = await window.coterea.settings.get()
      useAppStore.getState().setDisplayName(s.displayName)
      useAppStore.getState().setCollabPaneVisible(s.collabPaneVisible === true)
      const theme = parseTheme(s.theme)
      useAppStore.getState().setTheme(theme)
      applyUiTheme(theme)
      await enableCollab()
      const launchFiles = await window.coterea.app.consumeLaunchFiles()
      if (launchFiles.length > 0) await openPathsFromShell(launchFiles)
      if (useAppStore.getState().tabs.length === 0) createUntitled()
    })()
    const offMenu = window.coterea.app.onMenu((payload) => {
      const { action, extra } = payload
      const tabId = useAppStore.getState().activeTabId
      const doc = tabId ? getTabDoc(tabId) : undefined
      if (action === 'new') createUntitled()
      if (action === 'open') void openDialog()
      if (action === 'open-recent' && extra) void openPaths([extra])
      if (action === 'save') void saveActive(false)
      if (action === 'save-as') void saveActive(true)
      if (action === 'close-tab' && tabId) void closeTab(tabId)
      if (action === 'undo') doc?.undo.undo()
      if (action === 'redo') doc?.undo.redo()
      if (action === 'find') {
        getActiveEditor()?.trigger('menu', 'actions.find', null)
      }
      if (action === 'replace') {
        getActiveEditor()?.trigger('menu', 'editor.action.startFindReplaceAction', null)
      }
      if (action === 'toggle-right') void toggleCollabPane()
      if (action === 'theme' && extra) {
        const theme = parseTheme(extra)
        void window.coterea.settings.set({ theme }).then((next) => {
          const applied = parseTheme(next.theme)
          useAppStore.getState().setTheme(applied)
          applyUiTheme(applied)
        })
      }
      if (action === 'md-view' && extra) {
        const id = useAppStore.getState().activeTabId
        if (id && (extra === 'edit' || extra === 'split' || extra === 'preview')) setMdView(id, extra)
      }
      if (action === 'md-view-cycle') {
        const id = useAppStore.getState().activeTabId
        if (id) cycleMdView(id)
      }
    })
    const offClose = window.coterea.app.onCloseRequest(() => {
      void handleAppClose()
    })
    return () => {
      offCollab()
      offMenu()
      offClose()
      offOpenFiles()
      offSettings()
    }
  }, [])

  useEffect(() => {
    if (displayName) setLocalUser({ name: displayName, color: localColor })
  }, [displayName, localColor])

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragging.current) return
      const pct = 100 - (e.clientX / window.innerWidth) * 100
      setRightWidth(Math.min(48, Math.max(22, pct)))
    }
    const onUp = (): void => {
      dragging.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return (
    <div className="app">
      <TitleBar />
      <div className="workspace">
        <div className="left-pane" style={{ width: collabPaneVisible ? `${100 - rightWidth}%` : '100%' }}>
          <TabBar />
          <div className="editor-wrap">
            {activeTabId && tabs.some((t) => t.id === activeTabId) ? (
              <EditorPane tabId={activeTabId} />
            ) : (
              <div className="empty">
                <svg className="empty-mark" viewBox="0 0 512 512" aria-hidden>
                  <g className="empty-mark-paper">
                    <path d="M159.92 22h157.46l104.08 104.08v294.53c0 38.86-30.53 69.39-69.39 69.39H159.92c-38.86 0-69.39-30.53-69.39-69.39V91.39c0-38.86 30.53-69.39 69.39-69.39z" />
                    <path d="M317.38 22v104.08h104.08" />
                  </g>
                  <rect className="empty-mark-bar" x="169.27" y="205.38" width="173.47" height="37.13" rx="21.35" />
                  <rect className="empty-mark-bar" x="169.27" y="271.75" width="173.47" height="37.13" rx="21.35" />
                  <rect className="empty-mark-bar" x="169.27" y="338.13" width="121.43" height="37.13" rx="21.35" />
                </svg>
                <div className="empty-actions">
                  <button type="button" className="empty-action" onClick={() => createUntitled()}>
                    <span>新規</span>
                    <span className="empty-keys">
                      <kbd>Ctrl</kbd>
                      <span>+</span>
                      <kbd>N</kbd>
                    </span>
                  </button>
                  <button type="button" className="empty-action" onClick={() => void openDialog()}>
                    <span>開く…</span>
                    <span className="empty-keys">
                      <kbd>Ctrl</kbd>
                      <span>+</span>
                      <kbd>O</kbd>
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {collabPaneVisible && (
          <>
            <div
              className="splitter"
              onMouseDown={() => {
                dragging.current = true
              }}
            />
            <div className="right-wrap" style={{ width: `${rightWidth}%` }}>
              <RightPane />
            </div>
          </>
        )}
      </div>
      <StatusBar />
    </div>
  )
}
