import { languageFromPath, titleFromPath } from './monacoEnv'
import { createTabDoc, disposeTabDoc, getText, languageOf, replaceText, setLanguage } from './docs'
import { announceNewDoc, isCollabActive, leaveCollab } from './collab'
import { useAppStore, type TabInfo } from '../store'
import { DEFAULT_ENCODING, type EncodingId } from '../../../shared/encoding'

function newId(): string {
  return crypto.randomUUID()
}

export function createUntitled(): TabInfo {
  const { displayName, collab } = useAppStore.getState()
  const id = newId()
  const tab: TabInfo = {
    id,
    path: null,
    hostPath: null,
    title: '無題',
    language: 'plaintext',
    isDirty: false,
    encoding: DEFAULT_ENCODING
  }
  createTabDoc(id, '', 'plaintext', { name: displayName, color: collab.localColor })
  useAppStore.getState().setTabs((tabs) => [...tabs, tab])
  useAppStore.getState().setActiveTabId(id)
  announceNewDoc(tab)
  return tab
}

export async function openPaths(paths: string[]): Promise<void> {
  const { displayName, collab, tabs } = useAppStore.getState()
  for (const filePath of paths) {
    const existing = tabs.find((t) => t.path === filePath)
    if (existing) {
      useAppStore.getState().setActiveTabId(existing.id)
      continue
    }
    const read = await window.coterea.fs.read(filePath)
    if (!read) continue
    const id = newId()
    const language = languageOf(filePath)
    createTabDoc(id, read.content, language, { name: displayName, color: collab.localColor })
    const tab: TabInfo = {
      id,
      path: filePath,
      hostPath: filePath,
      title: titleFromPath(filePath),
      language,
      isDirty: false,
      encoding: read.encoding
    }
    useAppStore.getState().setTabs((prev) => [...prev, tab])
    useAppStore.getState().setActiveTabId(id)
    announceNewDoc(tab)
  }
}

export async function openDialog(): Promise<void> {
  const paths = await window.coterea.fs.open()
  await openPaths(paths)
}

export async function saveTab(tabId: string, saveAs = false): Promise<boolean> {
  const tab = useAppStore.getState().tabs.find((t) => t.id === tabId)
  if (!tab) return false
  let path = tab.path
  if (!path || saveAs) {
    const result = await window.coterea.fs.saveAs(tab.title === '無題' ? 'untitled.txt' : tab.title)
    if (result.canceled || !result.path) return false
    path = result.path
  }
  await window.coterea.fs.write(path, getText(tabId), tab.encoding)
  const language = languageFromPath(path)
  setLanguage(tabId, language)
  useAppStore.getState().setTabs((tabs) =>
    tabs.map((t) =>
      t.id === tabId
        ? { ...t, path, hostPath: t.hostPath ?? path, title: titleFromPath(path), language, isDirty: false }
        : t
    )
  )
  return true
}

export async function closeTab(tabId: string): Promise<void> {
  const tab = useAppStore.getState().tabs.find((t) => t.id === tabId)
  if (!tab) return
  if (tab.isDirty && !isCollabActive()) {
    const decision = await window.coterea.fs.confirmUnsaved([tab.title])
    if (decision === 'cancel') return
    if (decision === 'save') {
      const ok = await saveTab(tabId)
      if (!ok) return
    }
  }
  disposeTabDoc(tabId)
  const { tabs, activeTabId } = useAppStore.getState()
  const next = tabs.filter((t) => t.id !== tabId)
  useAppStore.getState().setTabs(next)
  if (activeTabId === tabId) {
    useAppStore.getState().setActiveTabId(next.at(-1)?.id ?? null)
  }
}

export async function handleAppClose(): Promise<void> {
  const dirty = useAppStore.getState().tabs.filter((t) => t.isDirty)
  if (dirty.length > 0) {
    const decision = await window.coterea.fs.confirmUnsaved(dirty.map((t) => t.title))
    if (decision === 'cancel') return
    if (decision === 'save') {
      for (const tab of dirty) {
        const ok = await saveTab(tab.id)
        if (!ok) return
      }
    }
  }
  if (isCollabActive()) await leaveCollab()
  await window.coterea.app.confirmClose()
}

export async function saveActive(saveAs = false): Promise<void> {
  const id = useAppStore.getState().activeTabId
  if (id) await saveTab(id, saveAs)
}

export function setTabEncoding(tabId: string, encoding: EncodingId): void {
  useAppStore.getState().setTabs((tabs) =>
    tabs.map((t) => (t.id === tabId ? { ...t, encoding } : t))
  )
}

export async function reopenWithEncoding(tabId: string, encoding: EncodingId): Promise<void> {
  const tab = useAppStore.getState().tabs.find((t) => t.id === tabId)
  if (!tab?.path) {
    setTabEncoding(tabId, encoding)
    return
  }
  if (tab.isDirty) {
    const decision = await window.coterea.fs.confirmUnsaved([tab.title])
    if (decision === 'cancel') return
    if (decision === 'save') {
      const ok = await saveTab(tabId)
      if (!ok) return
    }
  }
  const read = await window.coterea.fs.read(tab.path, encoding)
  if (!read) return
  replaceText(tabId, read.content)
  useAppStore.getState().setTabs((tabs) =>
    tabs.map((t) =>
      t.id === tabId ? { ...t, encoding: read.encoding, isDirty: false } : t
    )
  )
}

