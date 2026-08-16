import { languageFromPath, titleFromPath, isMarkdownLanguage } from './monacoEnv'
import { createTabDoc, disposeTabDoc, getText, languageOf, replaceText, setLanguage } from './docs'
import { announceNewDoc, isCollabActive, publishManifest } from './collab'
import { useAppStore, type MdView, type TabInfo } from '../store'
import { DEFAULT_ENCODING, type EncodingId } from '../../../shared/encoding'
import { idsOverlap } from '../../../shared/fileSession'

function newId(): string {
  return crypto.randomUUID()
}

function mdViewFor(language: string, current?: MdView): MdView {
  if (!isMarkdownLanguage(language)) return 'edit'
  return current && current !== 'edit' ? current : 'split'
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
    encoding: DEFAULT_ENCODING,
    fileIds: [],
    mdView: 'edit',
    mdSplitPct: 50,
    mdScrollSync: true
  }
  createTabDoc(id, '', 'plaintext', { name: displayName, color: collab.localColor })
  useAppStore.getState().setTabs((tabs) => [...tabs, tab])
  useAppStore.getState().setActiveTabId(id)
  announceNewDoc(tab)
  return tab
}

export async function toggleCollabPane(): Promise<void> {
  const next = !useAppStore.getState().collabPaneVisible
  useAppStore.getState().setCollabPaneVisible(next)
  await window.coterea.settings.set({ collabPaneVisible: next })
}

export async function setCollabPaneVisible(visible: boolean): Promise<void> {
  useAppStore.getState().setCollabPaneVisible(visible)
  await window.coterea.settings.set({ collabPaneVisible: visible })
}

export async function openPathsFromShell(paths: string[]): Promise<void> {
  await openPaths(paths)
  const opened = useAppStore.getState().tabs.some((t) => t.path)
  if (!opened) return
  const blanks = useAppStore.getState().tabs.filter((t) => !t.path && !t.isDirty)
  for (const blank of blanks) {
    if (useAppStore.getState().tabs.length <= 1) break
    await closeTab(blank.id)
  }
}

export async function openPaths(paths: string[]): Promise<void> {
  for (const filePath of paths) {
    const read = await window.coterea.fs.read(filePath)
    if (!read) continue
    const current = useAppStore.getState()
    const existing = current.tabs.find(
      (t) =>
        t.path === filePath ||
        t.path === read.path ||
        idsOverlap(t.fileIds, read.fileIds)
    )
    if (existing) {
      useAppStore.getState().setActiveTabId(existing.id)
      continue
    }
    const { displayName, collab } = useAppStore.getState()
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
      encoding: read.encoding,
      fileIds: read.fileIds,
      mdView: mdViewFor(language),
      mdSplitPct: 50,
      mdScrollSync: true
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
  const fileIds = await window.coterea.fs.identity(path)
  const language = languageFromPath(path)
  setLanguage(tabId, language)
  useAppStore.getState().setTabs((tabs) =>
    tabs.map((t) =>
      t.id === tabId
        ? {
            ...t,
            path,
            hostPath: t.hostPath ?? path,
            title: titleFromPath(path),
            language,
            isDirty: false,
            fileIds,
            mdView: mdViewFor(language, t.mdView)
          }
        : t
    )
  )
  publishManifest()
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
  publishManifest()
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

export function setMdView(tabId: string, mdView: MdView): void {
  useAppStore.getState().setTabs((tabs) =>
    tabs.map((t) =>
      t.id === tabId && isMarkdownLanguage(t.language) ? { ...t, mdView } : t
    )
  )
}

export function setMdScrollSync(tabId: string, mdScrollSync: boolean): void {
  useAppStore.getState().setTabs((tabs) =>
    tabs.map((t) => (t.id === tabId ? { ...t, mdScrollSync } : t))
  )
}

export function setMdSplitPct(tabId: string, mdSplitPct: number): void {
  const clamped = Math.min(75, Math.max(25, mdSplitPct))
  useAppStore.getState().setTabs((tabs) =>
    tabs.map((t) => (t.id === tabId ? { ...t, mdSplitPct: clamped } : t))
  )
}

export function cycleMdView(tabId: string): void {
  const tab = useAppStore.getState().tabs.find((t) => t.id === tabId)
  if (!tab || !isMarkdownLanguage(tab.language)) return
  const order: MdView[] = ['edit', 'split', 'preview']
  const next = order[(order.indexOf(tab.mdView) + 1) % order.length]
  setMdView(tabId, next)
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

