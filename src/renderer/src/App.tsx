import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { RightPane } from './components/RightPane'
import { StatusBar } from './components/StatusBar'
import { TabBar } from './components/TabBar'
import { TitleBar } from './components/TitleBar'
import { attachCollabListeners, enableCollab } from './lib/collab'
import { attachFileWatch, closeAllTabs, closeOtherTabs, closeTab, createUntitled, cycleMdView, cycleTab, handleAppClose, openDialog, openPaths, openPathsFromShell, openSettingsTab, saveActive, setCollabPaneVisible, setMdView, toggleCollabPane, toggleMdOutline, toggleMinimap } from './lib/actions'
import { attachAiListeners, loadChat } from './lib/chat'
import { preloadEditor, applyLoadedMonacoTheme } from './lib/editorReady'
import { applyUiTheme } from './lib/uiTheme'
import { getActiveEditor } from './lib/editorHandle'
import { isSettingsTab, isVirtualTab, useAppStore } from './store'
import { parseTheme } from '../../shared/theme'
import { attachSessionPersist, enableSessionPersist, restoreSession } from './lib/workspaceSession'
import { SettingsPane } from './components/SettingsPane'

const EditorPane = lazy(() => import('./components/EditorPane').then((m) => ({ default: m.EditorPane })))

let bootPromise: Promise<void> | null = null

function bootApp(): Promise<void> {
  if (!bootPromise) {
    bootPromise = (async () => {
      try {
        const editorP = preloadEditor()
        const paneP = import('./components/EditorPane')
        const s = await window.coterea.settings.get()
        useAppStore.getState().setDisplayName(s.displayName)
        useAppStore.getState().setCollabPaneVisible(s.collabPaneVisible === true)
        useAppStore.getState().setMinimapEnabled(s.minimapEnabled === true)
        useAppStore.getState().setMdOutlineEnabled(s.mdOutlineEnabled !== false)
        const theme = parseTheme(s.theme)
        useAppStore.getState().setTheme(theme)
        applyUiTheme(theme)
        const [launchFiles] = await Promise.all([
          window.coterea.app.consumeLaunchFiles(),
          editorP,
          paneP
        ])
        await applyLoadedMonacoTheme(theme)
        await restoreSession()
        if (launchFiles.length > 0) await openPathsFromShell(launchFiles)
        if (useAppStore.getState().tabs.length === 0) await createUntitled()
        enableSessionPersist()
        await loadChat()
        void import('./lib/monacoEnv').then((m) => m.preloadMonacoLanguages())
        void enableCollab()
      } catch (err) {
        console.error(err)
      }
    })()
  }
  return bootPromise
}

export function App(): React.JSX.Element {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const collabPaneVisible = useAppStore((s) => s.collabPaneVisible)
  const displayName = useAppStore((s) => s.displayName)
  const localColor = useAppStore((s) => s.collab.localColor)
  const localPeerId = useAppStore((s) => s.collab.localPeerId)
  const [rightWidth, setRightWidth] = useState(35)
  const [booted, setBooted] = useState(false)
  const [resizing, setResizing] = useState(false)
  const dragging = useRef(false)

  useEffect(() => {
    void bootApp().then(() => setBooted(true))
    const offSession = attachSessionPersist()
    const offCollab = attachCollabListeners()
    const offAi = attachAiListeners()
    const offWatch = attachFileWatch()
    const offOpenFiles = window.coterea.app.onOpenFiles((paths) => {
      void openPathsFromShell(paths)
    })
    const offSettings = window.coterea.settings.onChange((next) => {
      useAppStore.getState().setDisplayName(next.displayName)
      useAppStore.getState().setCollabPaneVisible(next.collabPaneVisible === true)
      useAppStore.getState().setMinimapEnabled(next.minimapEnabled === true)
      useAppStore.getState().setMdOutlineEnabled(next.mdOutlineEnabled !== false)
      const applied = parseTheme(next.theme)
      useAppStore.getState().setTheme(applied)
      applyUiTheme(applied)
      void applyLoadedMonacoTheme(applied)
      void preloadEditor().then((docs) => {
        docs.setLocalUser({
          name: next.displayName,
          color: useAppStore.getState().collab.localColor,
          peerId: useAppStore.getState().collab.localPeerId ?? undefined
        })
      })
      void window.coterea.collab.setDisplayName(next.displayName)
    })
    const offMenu = window.coterea.app.onMenu((payload) => {
      const { action, extra } = payload
      const tabId = useAppStore.getState().activeTabId
      if (action === 'new') void createUntitled()
      if (action === 'open') void openDialog()
      if (action === 'open-recent' && extra) void openPaths([extra])
      if (action === 'save') void saveActive(false)
      if (action === 'save-as') void saveActive(true)
      if (action === 'close-tab' && tabId) void closeTab(tabId)
      if (action === 'close-other-tabs' && tabId) void closeOtherTabs(tabId)
      if (action === 'close-all-tabs') void closeAllTabs()
      if (action === 'next-tab') cycleTab(1)
      if (action === 'prev-tab') cycleTab(-1)
      if (action === 'collab-notice') void window.coterea.app.showCollabNotice()
      if (action === 'undo' || action === 'redo') {
        void preloadEditor().then((docs) => {
          const doc = tabId ? docs.getTabDoc(tabId) : undefined
          if (action === 'undo') doc?.undo.undo()
          if (action === 'redo') doc?.undo.redo()
        })
      }
      if (action === 'find') {
        getActiveEditor()?.trigger('menu', 'actions.find', null)
      }
      if (action === 'replace') {
        getActiveEditor()?.trigger('menu', 'editor.action.startFindReplaceAction', null)
      }
      if (action === 'toggle-right') void toggleCollabPane()
      if (action === 'show-right') void setCollabPaneVisible(true)
      if (action === 'toggle-minimap') void toggleMinimap()
      if (action === 'toggle-md-outline') void toggleMdOutline()
      if (action === 'settings') {
        const section =
          extra === 'general' ||
          extra === 'appearance' ||
          extra === 'ai-connection' ||
          extra === 'ai-params'
            ? extra
            : undefined
        openSettingsTab(section)
      }
      if (action === 'theme' && extra) {
        const theme = parseTheme(extra)
        void window.coterea.settings.set({ theme }).then((next) => {
          const applied = parseTheme(next.theme)
          useAppStore.getState().setTheme(applied)
          applyUiTheme(applied)
          void applyLoadedMonacoTheme(applied)
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
      offSession()
      offCollab()
      offAi()
      offWatch()
      offMenu()
      offClose()
      offOpenFiles()
      offSettings()
    }
  }, [])

  useEffect(() => {
    if (!displayName) return
    void preloadEditor().then((docs) => {
      docs.setLocalUser({ name: displayName, color: localColor, peerId: localPeerId ?? undefined })
    })
  }, [displayName, localColor, localPeerId])

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragging.current) return
      const pct = 100 - (e.clientX / window.innerWidth) * 100
      setRightWidth(Math.min(48, Math.max(22, pct)))
    }
    const onUp = (): void => {
      if (!dragging.current) return
      dragging.current = false
      setResizing(false)
      document.body.classList.remove('is-resizing-panels')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const hasSettingsTab = tabs.some(isSettingsTab)
  const settingsOpen = Boolean(activeTab && isSettingsTab(activeTab))
  const showEditor = Boolean(activeTabId && activeTab && !isVirtualTab(activeTab))

  return (
    <div className="app">
      <TitleBar />
      <div className="workspace">
        <div className="left-pane" style={{ width: collabPaneVisible ? `${100 - rightWidth}%` : '100%' }}>
          <TabBar />
          <div className="editor-wrap">
            {hasSettingsTab && (
              <div className="settings-host" hidden={!settingsOpen}>
                <SettingsPane />
              </div>
            )}
            {showEditor && activeTabId ? (
              <Suspense fallback={<div className="editor-stage"><div className="editor-host" /></div>}>
                <EditorPane tabId={activeTabId} />
              </Suspense>
            ) : booted ? (
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
                  <button type="button" className="empty-action" onClick={() => void createUntitled()}>
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
            ) : (
              <div className="editor-stage">
                <div className="editor-host" />
              </div>
            )}
          </div>
        </div>
        {collabPaneVisible && (
          <>
            <div
              className={`splitter${resizing ? ' active' : ''}`}
              onMouseDown={() => {
                dragging.current = true
                setResizing(true)
                document.body.classList.add('is-resizing-panels')
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
