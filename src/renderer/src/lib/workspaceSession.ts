import { SETTINGS_TAB_ID, parseEditorSession, type EditorSession, type SessionTab } from '../../../shared/session'
import { preloadEditor } from './editorReady'
import { isSettingsTab, useAppStore } from '../store'

let persistTimer: ReturnType<typeof setTimeout> | null = null
let persistEnabled = false

async function captureSession(opts?: { dropDirtyUntitled?: boolean }): Promise<EditorSession> {
  const docs = await preloadEditor()
  const { tabs, activeTabId } = useAppStore.getState()
  const captured: SessionTab[] = []
  let active = 0
  for (const tab of tabs) {
    let item: SessionTab | null = null
    if (isSettingsTab(tab)) item = { kind: 'settings' }
    else if (tab.path) {
      item = {
        kind: 'file',
        path: tab.path,
        encoding: tab.encoding,
        mdView: tab.mdView,
        mdSplitPct: tab.mdSplitPct,
        mdScrollSync: tab.mdScrollSync
      }
    } else if (!(opts?.dropDirtyUntitled && tab.isDirty)) {
      item = {
        kind: 'untitled',
        content: docs.getText(tab.id),
        encoding: tab.encoding
      }
    }
    if (!item) continue
    if (tab.id === activeTabId) active = captured.length
    captured.push(item)
  }
  return parseEditorSession({ tabs: captured, active })
}

export async function persistSessionNow(opts?: { dropDirtyUntitled?: boolean }): Promise<void> {
  const session = await captureSession(opts)
  await window.coterea.session.set(session)
}

export function persistSessionSoon(): void {
  if (!persistEnabled) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    void persistSessionNow()
  }, 400)
}

export function attachSessionPersist(): () => void {
  const unsub = useAppStore.subscribe((s, prev) => {
    if (s.tabs === prev.tabs && s.activeTabId === prev.activeTabId) return
    persistSessionSoon()
  })
  return () => {
    unsub()
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = null
  }
}

export function enableSessionPersist(): void {
  persistEnabled = true
  void persistSessionNow()
}

export async function restoreSession(): Promise<void> {
  const { createUntitled, openSettingsTab, openPaths, setMdScrollSync, setMdSplitPct, setMdView, reopenWithEncoding } =
    await import('./actions')
  const session = parseEditorSession(await window.coterea.session.get())
  const restoredIds: string[] = []
  for (const item of session.tabs) {
    if (item.kind === 'settings') {
      openSettingsTab()
      restoredIds.push(SETTINGS_TAB_ID)
      continue
    }
    if (item.kind === 'file') {
      try {
        await openPaths([item.path])
      } catch {
        continue
      }
      const tab = useAppStore.getState().tabs.find((t) => t.path === item.path)
      if (!tab) continue
      if (item.mdView) setMdView(tab.id, item.mdView)
      if (item.mdSplitPct != null) setMdSplitPct(tab.id, item.mdSplitPct)
      if (item.mdScrollSync != null) setMdScrollSync(tab.id, item.mdScrollSync)
      if (item.encoding && item.encoding !== tab.encoding) {
        await reopenWithEncoding(tab.id, item.encoding)
      }
      restoredIds.push(tab.id)
      continue
    }
    const tab = await createUntitled(item.content, { activate: false, encoding: item.encoding })
    restoredIds.push(tab.id)
  }
  const activeId = restoredIds[session.active] ?? restoredIds.at(-1)
  if (activeId) useAppStore.getState().setActiveTabId(activeId)
}
