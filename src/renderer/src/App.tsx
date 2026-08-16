import { useEffect, useRef, useState } from 'react'
import { EditorPane } from './components/EditorPane'
import { JoinModal, RightPane, SettingsModal } from './components/RightPane'
import { StatusBar } from './components/StatusBar'
import { TabBar } from './components/TabBar'
import { attachCollabListeners, leaveCollab, startCollab } from './lib/collab'
import { closeTab, createUntitled, handleAppClose, openDialog, openPaths, saveActive } from './lib/actions'
import { getTabDoc, setLocalUser } from './lib/docs'
import { getActiveEditor } from './lib/editorHandle'
import { useAppStore } from './store'

export function App(): React.JSX.Element {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const rightCollapsed = useAppStore((s) => s.rightCollapsed)
  const setRightCollapsed = useAppStore((s) => s.setRightCollapsed)
  const displayName = useAppStore((s) => s.displayName)
  const localColor = useAppStore((s) => s.collab.localColor)
  const [rightWidth, setRightWidth] = useState(35)
  const dragging = useRef(false)

  useEffect(() => {
    const offCollab = attachCollabListeners()
    void (async () => {
      const s = await window.coterea.settings.get()
      useAppStore.getState().setDisplayName(s.displayName)
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
      if (action === 'toggle-right') setRightCollapsed(!useAppStore.getState().rightCollapsed)
      if (action === 'collab-start') void startCollab()
      if (action === 'collab-join') useAppStore.getState().setJoinOpen(true)
      if (action === 'collab-leave') void leaveCollab()
      if (action === 'settings') useAppStore.getState().setSettingsOpen(true)
    })
    const offClose = window.coterea.app.onCloseRequest(() => {
      void handleAppClose()
    })
    return () => {
      offCollab()
      offMenu()
      offClose()
    }
  }, [setRightCollapsed])

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
      <div className="brandbar">
        <span className="logo">COTEREA</span>
        <span className="tagline">人と AI が、ともに書く。</span>
      </div>
      <div className="workspace">
        <div className="left-pane" style={{ width: rightCollapsed ? '100%' : `${100 - rightWidth}%` }}>
          <TabBar />
          <div className="editor-wrap">
            {activeTabId && tabs.some((t) => t.id === activeTabId) ? (
              <EditorPane tabId={activeTabId} />
            ) : (
              <div className="empty">Coterea</div>
            )}
          </div>
        </div>
        {!rightCollapsed && (
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
      <JoinModal />
      <SettingsModal />
    </div>
  )
}
