import { languageFromPath, titleFromPath, isMarkdownLanguage } from './fileMeta'
import { announceNewDoc, flushPendingSaves, forgetSavedText, isCollabActive, isTabSaving, persistTab, publishManifest, rememberSavedText, savedTextOf, withSuppressDirty } from './collab'
import { preloadEditor } from './editorReady'
import { isSettingsTab, useAppStore, type MdView, type TabInfo } from '../store'
import { DEFAULT_ENCODING, type EncodingId } from '../../../shared/encoding'
import { idsOverlap } from '../../../shared/fileSession'
import { shouldPromptExternalChange, normalizeText } from '../../../shared/externalChange'
import { REMOTE_SAVE_MS } from '../../../shared/types'
import { isUnsupportedOpen, type UnsupportedOpen } from '../../../shared/openPolicy'
import { SETTINGS_TAB_ID } from '../../../shared/session'
import { persistSessionNow } from './workspaceSession'
import { requestSettingsSection, revertOpenSettings, saveOpenSettings, type SettingsSection } from './settingsTab'

function newId(): string {
  return crypto.randomUUID()
}

function mdViewFor(language: string, current?: MdView): MdView {
  if (!isMarkdownLanguage(language)) return 'edit'
  return current && current !== 'edit' ? current : 'split'
}

function collabUser(): { name: string; color: string; peerId?: string } {
  const { displayName, collab } = useAppStore.getState()
  return { name: displayName, color: collab.localColor, peerId: collab.localPeerId ?? undefined }
}

export async function createUntitled(
  content = '',
  opts?: { activate?: boolean; encoding?: EncodingId }
): Promise<TabInfo> {
  const { createTabDoc } = await preloadEditor()
  const id = newId()
  const encoding = opts?.encoding ?? DEFAULT_ENCODING
  const tab: TabInfo = {
    id,
    kind: 'file',
    path: null,
    hostPath: null,
    title: '無題',
    language: 'plaintext',
    isDirty: content.length > 0,
    encoding,
    fileIds: [],
    mdView: 'edit',
    mdSplitPct: 50,
    mdScrollSync: true,
    saveError: null
  }
  createTabDoc(id, content, 'plaintext', collabUser())
  rememberSavedText(id, '')
  useAppStore.getState().setTabs((tabs) => [...tabs, tab])
  if (opts?.activate !== false) useAppStore.getState().setActiveTabId(id)
  announceNewDoc(tab)
  return tab
}

export function openSettingsTab(section?: SettingsSection): void {
  if (section) requestSettingsSection(section)
  const existing = useAppStore.getState().tabs.find(isSettingsTab)
  if (existing) {
    useAppStore.getState().setActiveTabId(existing.id)
    return
  }
  const tab: TabInfo = {
    id: SETTINGS_TAB_ID,
    kind: 'settings',
    path: null,
    hostPath: null,
    title: '設定',
    language: 'plaintext',
    isDirty: false,
    encoding: DEFAULT_ENCODING,
    fileIds: [],
    mdView: 'edit',
    mdSplitPct: 50,
    mdScrollSync: true,
    saveError: null
  }
  useAppStore.getState().setTabs((tabs) => [...tabs, tab])
  useAppStore.getState().setActiveTabId(tab.id)
}

function watchPath(filePath: string | null): void {
  if (filePath) void window.coterea.fs.watch(filePath)
}

function unwatchIfUnused(filePath: string | null, exceptTabId?: string): void {
  if (!filePath) return
  const still = useAppStore.getState().tabs.some((t) => t.path === filePath && t.id !== exceptTabId)
  if (!still) void window.coterea.fs.unwatch(filePath)
}

function samePath(a: string, b: string): boolean {
  return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()
}

type DiskSnap = { status: 'match' | 'differ' | 'unknown'; disk: string | null; editor: string }

async function readDiskSnap(tab: TabInfo): Promise<DiskSnap> {
  const { getText } = await preloadEditor()
  const editor = normalizeText(getText(tab.id))
  if (!tab.path) return { status: 'match', disk: '', editor }
  const disk = await window.coterea.fs.peek(tab.path, tab.encoding)
  if (disk == null) return { status: 'unknown', disk: null, editor }
  const nDisk = normalizeText(disk)
  return { status: nDisk === editor ? 'match' : 'differ', disk: nDisk, editor }
}

function isExternalChange(tab: TabInfo, snap: DiskSnap, stillSaving: boolean): boolean {
  return shouldPromptExternalChange({
    diskStatus: snap.status,
    disk: snap.disk,
    editor: snap.editor,
    lastSaved: savedTextOf(tab.id),
    stillSaving
  })
}

function tabByPath(filePath: string): TabInfo | undefined {
  return useAppStore.getState().tabs.find((t) => t.path && samePath(t.path, filePath))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitUntilQuiet(tabId: string): Promise<boolean> {
  const deadline = Date.now() + REMOTE_SAVE_MS + 500
  while (Date.now() < deadline) {
    if (!isTabSaving(tabId)) return true
    await sleep(100)
  }
  return !isTabSaving(tabId)
}

export async function reloadTabFromDisk(tabId: string): Promise<void> {
  const tab = useAppStore.getState().tabs.find((t) => t.id === tabId)
  if (!tab?.path) return
  const read = await window.coterea.fs.read(tab.path, tab.encoding)
  if (!read || isUnsupportedOpen(read)) return
  const { replaceText } = await preloadEditor()
  withSuppressDirty(() => replaceText(tabId, read.content))
  rememberSavedText(tabId, read.content)
  useAppStore.getState().setTabs((tabs) =>
    tabs.map((t) => (t.id === tabId ? { ...t, isDirty: false, saveError: null, encoding: read.encoding } : t))
  )
}

export function attachFileWatch(): () => void {
  const prompting = new Set<string>()
  return window.coterea.fs.onChanged(async ({ path }) => {
    const key = path.replace(/\\/g, '/').toLowerCase()
    const tab = tabByPath(path)
    if (!tab || prompting.has(key)) return
    const quiet = await waitUntilQuiet(tab.id)
    if (!quiet) return
    const first = await readDiskSnap(tab)
    if (!isExternalChange(tab, first, isTabSaving(tab.id))) return
    await sleep(isCollabActive() ? 1000 : 400)
    const mid = tabByPath(path)
    if (!mid) return
    const midQuiet = await waitUntilQuiet(mid.id)
    if (!midQuiet) return
    const second = await readDiskSnap(mid)
    if (!isExternalChange(mid, second, isTabSaving(mid.id)) || second.disk == null) return
    await sleep(400)
    const latest = tabByPath(path)
    if (!latest) return
    if (isTabSaving(latest.id)) return
    const third = await readDiskSnap(latest)
    if (!isExternalChange(latest, third, false) || third.disk == null) return
    if (third.disk !== second.disk) return
    if (prompting.has(key)) return
    prompting.add(key)
    try {
      const decision = await window.coterea.fs.confirmExternalChange(latest.path ?? path)
      const after = tabByPath(path)
      if (decision === 'reload' && after) await reloadTabFromDisk(after.id)
    } finally {
      prompting.delete(key)
    }
  })
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
  const blanks = useAppStore.getState().tabs.filter((t) => t.kind === 'file' && !t.path && !t.isDirty)
  for (const blank of blanks) {
    if (useAppStore.getState().tabs.length <= 1) break
    await closeTab(blank.id)
  }
}

export async function openPaths(paths: string[]): Promise<void> {
  const skipped: UnsupportedOpen[] = []
  for (const filePath of paths) {
    let read: Awaited<ReturnType<typeof window.coterea.fs.read>>
    try {
      read = await window.coterea.fs.read(filePath)
    } catch {
      continue
    }
    if (isUnsupportedOpen(read)) {
      skipped.push(read)
      continue
    }
    if (!read) continue
    const current = useAppStore.getState()
    const existing = current.tabs.find(
      (t) =>
        !isSettingsTab(t) &&
        (t.path === filePath || t.path === read.path || idsOverlap(t.fileIds, read.fileIds))
    )
    if (existing) {
      useAppStore.getState().setActiveTabId(existing.id)
      continue
    }
    const id = newId()
    const language = languageFromPath(filePath)
    const { createTabDoc } = await preloadEditor()
    createTabDoc(id, read.content, language, collabUser())
    rememberSavedText(id, read.content)
    const tab: TabInfo = {
      id,
      kind: 'file',
      path: filePath,
      hostPath: filePath,
      title: titleFromPath(filePath),
      language,
      isDirty: false,
      encoding: read.encoding,
      fileIds: read.fileIds,
      mdView: mdViewFor(language),
      mdSplitPct: 50,
      mdScrollSync: true,
      saveError: null
    }
    useAppStore.getState().setTabs((prev) => [...prev, tab])
    useAppStore.getState().setActiveTabId(id)
    watchPath(filePath)
    announceNewDoc(tab)
  }
  if (skipped.length > 0) await window.coterea.fs.warnUnsupported(skipped)
}

export async function openDialog(): Promise<void> {
  const paths = await window.coterea.fs.open()
  await openPaths(paths)
}

export async function saveTab(tabId: string, saveAs = false): Promise<boolean> {
  const tab = useAppStore.getState().tabs.find((t) => t.id === tabId)
  if (!tab) return false
  if (isSettingsTab(tab)) return saveOpenSettings()
  if (tab.path && !saveAs) {
    return persistTab(tabId)
  }
  let path = tab.path
  if (!path || saveAs) {
    const result = await window.coterea.fs.saveAs(tab.title === '無題' ? 'untitled.txt' : tab.title)
    if (result.canceled || !result.path) return false
    path = result.path
  }
  try {
    const { getText } = await preloadEditor()
    const content = getText(tabId)
    await window.coterea.fs.write(path, content, tab.encoding)
    rememberSavedText(tabId, content)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    useAppStore.getState().setTabs((tabs) =>
      tabs.map((t) => (t.id === tabId ? { ...t, saveError: message } : t))
    )
    return false
  }
  const fileIds = await window.coterea.fs.identity(path)
  const language = languageFromPath(path)
  const { setLanguage } = await preloadEditor()
  setLanguage(tabId, language)
  const previousPath = tab.path
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
            saveError: null,
            fileIds,
            mdView: mdViewFor(language, t.mdView)
          }
        : t
    )
  )
  if (previousPath && previousPath !== path) unwatchIfUnused(previousPath, tabId)
  watchPath(path)
  publishManifest()
  return true
}

export async function closeTab(tabId: string): Promise<void> {
  await flushPendingSaves([tabId])
  const tab = useAppStore.getState().tabs.find((t) => t.id === tabId)
  if (!tab) return
  if (tab.isDirty) {
    const decision = await window.coterea.fs.confirmUnsaved([tab.title])
    if (decision === 'cancel') return
    if (decision === 'save') {
      const ok = await saveTab(tabId)
      if (!ok) return
    } else if (isSettingsTab(tab)) {
      await revertOpenSettings()
    }
  }
  if (!isSettingsTab(tab)) {
    unwatchIfUnused(tab.path, tabId)
    const { disposeTabDoc } = await preloadEditor()
    disposeTabDoc(tabId)
    forgetSavedText(tabId)
  }
  const { tabs, activeTabId } = useAppStore.getState()
  const next = tabs.filter((t) => t.id !== tabId)
  useAppStore.getState().setTabs(next)
  if (activeTabId === tabId) {
    useAppStore.getState().setActiveTabId(next.at(-1)?.id ?? null)
  }
  publishManifest()
}

export async function handleAppClose(): Promise<void> {
  await flushPendingSaves()
  const dirty = useAppStore.getState().tabs.filter((t) => t.isDirty)
  if (dirty.length > 0) {
    const decision = await window.coterea.fs.confirmUnsaved(dirty.map((t) => t.title))
    if (decision === 'cancel') return
    if (decision === 'save') {
      for (const tab of dirty) {
        const ok = await saveTab(tab.id)
        if (!ok) return
      }
      await persistSessionNow()
    } else {
      if (dirty.some(isSettingsTab)) await revertOpenSettings()
      await persistSessionNow({ dropDirtyUntitled: true })
    }
  } else {
    await persistSessionNow()
  }
  await window.coterea.app.confirmClose()
}

export function cycleTab(delta: number): void {
  const { tabs, activeTabId, setActiveTabId } = useAppStore.getState()
  if (tabs.length === 0) return
  const index = Math.max(0, tabs.findIndex((t) => t.id === activeTabId))
  const next = tabs[(index + delta + tabs.length) % tabs.length]
  if (next) setActiveTabId(next.id)
}

export function activateTabAt(index: number): void {
  const tab = useAppStore.getState().tabs[index]
  if (tab) useAppStore.getState().setActiveTabId(tab.id)
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
  if (!read || isUnsupportedOpen(read)) return
  const { replaceText } = await preloadEditor()
  withSuppressDirty(() => replaceText(tabId, read.content))
  rememberSavedText(tabId, read.content)
  useAppStore.getState().setTabs((tabs) =>
    tabs.map((t) =>
      t.id === tabId ? { ...t, encoding: read.encoding, isDirty: false, saveError: null } : t
    )
  )
}

