import {
  cannotDeleteLastThread,
  emptyThread,
  historyChatThreads,
  isThreadOpen,
  openChatThreads,
  titleFromPrompt,
  type ChatMessage,
  type ChatMode,
  type ChatThread
} from '../../../shared/ai'
import {
  buildChatMessages,
  defaultContextTabIds,
  resolveOpenTabId,
  type ActiveFileContext,
  type SelectionContext
} from '../../../shared/chatMode'
import {
  capsuleFromDrag,
  capsulesFromDraftParts,
  draftPartsHaveContent,
  emptyDraftParts,
  formatChatContextClipboard,
  insertCapsuleIntoDraftParts,
  parseChatContextClipboard,
  plainTextFromDraftParts,
  primaryTabIdFromCapsules,
  removeCapsuleFromDraftParts,
  shortContextPath,
  type ChatContextDragPayload,
  type ContextCapsule,
  type DraftPart,
  type SoftLineRef
} from '../../../shared/chatContext'
import { markDirty } from './collab'
import { getTabDoc } from './docs'
import { preloadEditor } from './editorReady'
import { desiredTextAfterProposal } from '../../../shared/textOps'
import { getActiveEditor } from './editorHandle'
import { openSettingsTab, setCollabPaneVisible } from './actions'
import { reorderOpenById } from '../../../shared/tabOrder'
import { composerInsertCapsule } from './composerDom'
import { isVirtualTab, useAppStore } from '../store'
import type { AiStreamEvent, AiToolRequest } from '../../../shared/api'

let persistTimer: ReturnType<typeof setTimeout> | null = null
let listenersAttached = false
let streamBuf = { requestId: '', assistantId: '', text: '' }

function persistSoon(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    void window.coterea.chat.set(useAppStore.getState().chat)
  }, 250)
}

function patchActiveThread(fn: (thread: ChatThread) => ChatThread): void {
  useAppStore.getState().setChat((chat) => ({
    ...chat,
    threads: chat.threads.map((t) => (t.id === chat.activeId ? fn(t) : t))
  }))
  persistSoon()
}

export function activeThread(): ChatThread | undefined {
  const chat = useAppStore.getState().chat
  return chat.threads.find((t) => t.id === chat.activeId)
}

function freshThread(id = crypto.randomUUID()): ChatThread {
  return emptyThread(id, Date.now(), useAppStore.getState().chatMode)
}

export async function loadChat(): Promise<void> {
  const history = await window.coterea.chat.get()
  let { threads, activeId } = history
  let open = openChatThreads(threads)
  if (open.length === 0) {
    const fresh = freshThread()
    threads = [...threads, fresh]
    activeId = fresh.id
    open = [fresh]
  } else if (!open.some((t) => t.id === activeId)) {
    activeId = open[0].id
  }
  useAppStore.getState().setChat({ activeId, threads })
  const status = await window.coterea.ai.status()
  useAppStore.getState().setAiStatus(status)
  const usage = await window.coterea.ai.usage.get()
  useAppStore.getState().setAiUsage(usage)
}

export function newThread(): void {
  const thread = freshThread()
  useAppStore.getState().setChat((chat) => ({
    activeId: thread.id,
    threads: [...chat.threads, thread]
  }))
  persistSoon()
}

export function selectThread(id: string): void {
  useAppStore.getState().setChat((chat) => ({ ...chat, activeId: id }))
  persistSoon()
}

export function renameThread(id: string, title: string): void {
  const next = title.trim()
  if (!next) return
  useAppStore.getState().setChat((chat) => ({
    ...chat,
    threads: chat.threads.map((t) => (t.id === id ? { ...t, title: next, updatedAt: Date.now() } : t))
  }))
  persistSoon()
}

/** 開いている会話タブを toIndex（開いている一覧上の位置）へ並べ替える。 */
export function reorderOpenThread(threadId: string, toIndex: number): void {
  useAppStore.getState().setChat((chat) => ({
    ...chat,
    threads: reorderOpenById(chat.threads, threadId, toIndex, isThreadOpen)
  }))
  persistSoon()
}

export function closeThread(id: string): void {
  const chat = useAppStore.getState().chat
  const target = chat.threads.find((t) => t.id === id)
  if (!target) return
  const openThreads = openChatThreads(chat.threads)
  const hasContent = target.messages.some((m) => m.role === 'user' || m.content)

  if (!hasContent) {
    if (cannotDeleteLastThread(openThreads.length)) {
      patchActiveThread((t) => ({
        ...t,
        title: '新しい会話',
        messages: [],
        draftParts: emptyDraftParts(),
        updatedAt: Date.now(),
        open: true
      }))
      void setCollabPaneVisible(false)
      return
    }
    const threads = chat.threads.filter((t) => t.id !== id)
    const nextOpen = openChatThreads(threads)
    if (nextOpen.length === 0) void setCollabPaneVisible(false)
    const activeId = chat.activeId === id ? nextOpen[nextOpen.length - 1]?.id ?? threads[0].id : chat.activeId
    useAppStore.getState().setChat({ activeId, threads })
    persistSoon()
    return
  }

  let threads = chat.threads.map((t) => (t.id === id ? { ...t, open: false, updatedAt: Date.now() } : t))
  let activeId = chat.activeId
  if (activeId === id) {
    const stillOpen = openChatThreads(threads)
    if (stillOpen.length === 0) {
      void setCollabPaneVisible(false)
      const fresh = freshThread()
      threads = [...threads, fresh]
      activeId = fresh.id
    } else {
      activeId = stillOpen[stillOpen.length - 1].id
    }
  } else {
    const stillOpen = openChatThreads(threads)
    if (stillOpen.length === 0) void setCollabPaneVisible(false)
  }
  useAppStore.getState().setChat({ activeId, threads })
  persistSoon()
}

export function closeOtherThreads(keepId: string): void {
  const chat = useAppStore.getState().chat
  const open = openChatThreads(chat.threads)
  for (const thread of open) {
    if (thread.id !== keepId) closeThread(thread.id)
  }
}

export function closeAllThreads(): void {
  const chat = useAppStore.getState().chat
  const open = openChatThreads(chat.threads)
  for (const thread of open) {
    closeThread(thread.id)
  }
}

export function reopenThread(id: string): void {
  const chat = useAppStore.getState().chat
  if (!chat.threads.some((t) => t.id === id)) return
  useAppStore.getState().setChat({
    activeId: id,
    threads: chat.threads.map((t) => (t.id === id ? { ...t, open: true } : t))
  })
  persistSoon()
}

export function deleteThreadHistory(id: string): void {
  const chat = useAppStore.getState().chat
  const target = chat.threads.find((t) => t.id === id)
  if (!target) return
  if (!window.confirm(`「${target.title}」を履歴から完全に削除しますか？`)) return
  let threads = chat.threads.filter((t) => t.id !== id)
  if (threads.length === 0) threads = [freshThread()]
  if (openChatThreads(threads).length === 0) {
    const fresh = freshThread()
    threads = [...threads, fresh]
  }
  const open = openChatThreads(threads)
  const activeId = open.some((t) => t.id === chat.activeId) ? chat.activeId : open[open.length - 1].id
  useAppStore.getState().setChat({ activeId, threads })
  persistSoon()
}

export { historyChatThreads, isThreadOpen, openChatThreads }

export function setThreadMode(mode: ChatMode): void {
  patchActiveThread((t) => ({ ...t, mode, updatedAt: Date.now() }))
  useAppStore.getState().setChatMode(mode)
  void window.coterea.settings.set({ chatMode: mode })
}

export function setDraft(draft: string): void {
  patchActiveThread((t) => ({
    ...t,
    draftParts: [{ type: 'text', text: draft }]
  }))
}

export function setDraftParts(parts: DraftPart[]): void {
  patchActiveThread((t) => ({ ...t, draftParts: parts }))
}

export function setDraftContext(context: ContextCapsule[]): void {
  patchActiveThread((t) => {
    let parts: DraftPart[] = [{ type: 'text', text: plainTextOnly(t.draftParts) }]
    for (const capsule of context) {
      parts = insertCapsuleIntoDraftParts(parts, capsule, null)
    }
    return { ...t, draftParts: parts }
  })
}

function plainTextOnly(parts: DraftPart[] | undefined): string {
  let text = ''
  for (const part of parts ?? []) {
    if (part.type === 'text') text += part.text
  }
  return text
}

export function addDraftContext(capsule: ContextCapsule): void {
  insertDraftCapsule(capsule)
}

export function insertDraftCapsule(capsule: ContextCapsule, clientX?: number, clientY?: number): void {
  if (composerInsertCapsule(capsule, clientX, clientY)) {
    void setCollabPaneVisible(true)
    return
  }
  patchActiveThread((t) => ({
    ...t,
    draftParts: insertCapsuleIntoDraftParts(t.draftParts ?? emptyDraftParts(), capsule, null)
  }))
  void setCollabPaneVisible(true)
}

export function removeDraftContext(id: string): void {
  patchActiveThread((t) => ({
    ...t,
    draftParts: removeCapsuleFromDraftParts(t.draftParts ?? emptyDraftParts(), id)
  }))
}

/** エディタの選択範囲をチャットへカプセル添付し、右パネルを開く。 */
export function addActiveSelectionToChat(): boolean {
  const payload = activeSelectionPayload()
  if (!payload) return false
  addDraftContext(capsuleFromDrag(payload))
  void setCollabPaneVisible(true)
  return true
}

/** 開いているファイルタブをチャットへカプセル添付し、右パネルを開く。 */
export function addFileTabToChat(tabId: string): boolean {
  const tab = useAppStore.getState().tabs.find((t) => t.id === tabId)
  if (!tab || isVirtualTab(tab)) return false
  addDraftContext(
    capsuleFromDrag({
      kind: 'file',
      tabId: tab.id,
      title: tab.title,
      path: tab.path,
      language: tab.language
    })
  )
  void setCollabPaneVisible(true)
  return true
}

function activeSelectionPayload(): ChatContextDragPayload | null {
  const editor = getActiveEditor()
  const model = editor?.getModel()
  const sel = editor?.getSelection()
  if (!editor || !model || !sel || sel.isEmpty()) return null
  const { tabs, activeTabId } = useAppStore.getState()
  const tab = tabs.find((t) => t.id === activeTabId)
  if (!tab || isVirtualTab(tab)) return null
  const from = model.getOffsetAt(sel.getStartPosition())
  const to = model.getOffsetAt(sel.getEndPosition())
  if (to <= from) return null
  return {
    kind: 'selection',
    tabId: tab.id,
    title: tab.title,
    path: tab.path,
    language: tab.language,
    from,
    to,
    lineFrom: sel.startLineNumber,
    lineTo: sel.endLineNumber,
    text: model.getValueInRange(sel)
  }
}

/** 選択範囲のチャット参照をクリップボードへ。 */
export async function copyActiveSelectionChatRef(): Promise<boolean> {
  const payload = activeSelectionPayload()
  if (!payload) return false
  await navigator.clipboard.writeText(formatChatContextClipboard(payload))
  return true
}

/** ファイルタブのチャット参照をクリップボードへ。 */
export async function copyFileTabChatRef(tabId: string): Promise<boolean> {
  const tab = useAppStore.getState().tabs.find((t) => t.id === tabId)
  if (!tab || isVirtualTab(tab)) return false
  const payload: ChatContextDragPayload = {
    kind: 'file',
    tabId: tab.id,
    title: tab.title,
    path: tab.path,
    language: tab.language
  }
  await navigator.clipboard.writeText(formatChatContextClipboard(payload))
  return true
}

function matchOpenTabByName(name: string): { id: string; title: string; path: string | null; language: string } | null {
  const files = useAppStore.getState().tabs.filter((t) => !isVirtualTab(t))
  const normalized = name.replace(/\\/g, '/')
  const exactPath = files.find((t) => (t.path ?? '').replace(/\\/g, '/') === normalized)
  if (exactPath) return exactPath
  const shortHits = files.filter((t) => shortContextPath(t.path, t.title) === normalized || t.title === name)
  if (shortHits.length === 1) return shortHits[0]
  const base = normalized.split('/').pop()
  if (base) {
    const byBase = files.filter((t) => t.title === base)
    if (byBase.length === 1) return byBase[0]
  }
  return null
}

function softRefToPayload(ref: SoftLineRef): ChatContextDragPayload | null {
  const tab = matchOpenTabByName(ref.name)
  if (!tab) return null
  const doc = getTabDoc(tab.id)
  const model = doc?.model
  if (!model) return null
  const lineCount = model.getLineCount()
  const lineFrom = Math.min(ref.lineFrom, lineCount)
  const lineTo = Math.min(ref.lineTo, lineCount)
  const from = model.getOffsetAt({ lineNumber: lineFrom, column: 1 })
  const endCol = model.getLineMaxColumn(lineTo)
  const to = model.getOffsetAt({ lineNumber: lineTo, column: endCol })
  if (to <= from) return null
  return {
    kind: 'selection',
    tabId: tab.id,
    title: tab.title,
    path: tab.path,
    language: tab.language,
    from,
    to,
    lineFrom,
    lineTo,
    text: model.getValueInRange({
      startLineNumber: lineFrom,
      startColumn: 1,
      endLineNumber: lineTo,
      endColumn: endCol
    })
  }
}

/**
 * クリップボード文字列から、チャット入力へ挿すカプセル／テキスト列を作る。
 * 構造化参照と `path:行` のソフト参照をカプセル化する。
 */
export function clipboardTextToInserts(text: string): Array<
  { type: 'text'; text: string } | { type: 'capsule'; capsule: ContextCapsule }
> {
  const parsed = parseChatContextClipboard(text)
  const inserts: Array<{ type: 'text'; text: string } | { type: 'capsule'; capsule: ContextCapsule }> = []
  for (const payload of parsed.payloads) {
    inserts.push({ type: 'capsule', capsule: capsuleFromDrag(payload) })
  }
  for (const soft of parsed.softRefs) {
    const payload = softRefToPayload(soft)
    if (payload) inserts.push({ type: 'capsule', capsule: capsuleFromDrag(payload) })
    else {
      const label =
        soft.lineFrom === soft.lineTo ? `${soft.name}:${soft.lineFrom}` : `${soft.name}:${soft.lineFrom}-${soft.lineTo}`
      inserts.push({ type: 'text', text: label })
    }
  }
  if (parsed.remainder) inserts.push({ type: 'text', text: parsed.remainder })
  return inserts
}

async function resolveAttachedContext(capsules: readonly ContextCapsule[]): Promise<{
  files: ActiveFileContext[]
  selections: SelectionContext[]
  primaryTabId: string | null
}> {
  const { tabs } = useAppStore.getState()
  const { getText, getTabDoc } = await preloadEditor()
  const files: ActiveFileContext[] = []
  const selections: SelectionContext[] = []
  const seenFile = new Set<string>()

  for (const capsule of capsules) {
    const tab = tabs.find((t) => t.id === capsule.tabId)
    if (!tab || isVirtualTab(tab)) continue

    if (capsule.kind === 'file') {
      if (seenFile.has(tab.id)) continue
      seenFile.add(tab.id)
      files.push({
        id: tab.id,
        title: shortContextPath(tab.path, tab.title),
        language: tab.language,
        body: getText(tab.id)
      })
      continue
    }

    const doc = getTabDoc(tab.id)
    const model = doc?.model
    let from = capsule.from
    let to = capsule.to
    let text = capsule.text
    let lineFrom = capsule.lineFrom
    let lineTo = capsule.lineTo
    if (model && from >= 0 && to <= model.getValueLength() && to > from) {
      const start = model.getPositionAt(from)
      const end = model.getPositionAt(to)
      text = model.getValueInRange({
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column
      })
      lineFrom = start.lineNumber
      lineTo = end.lineNumber
    }
    selections.push({
      from,
      to,
      text,
      tabId: tab.id,
      title: shortContextPath(tab.path, tab.title),
      lineFrom,
      lineTo
    })
    if (!seenFile.has(tab.id)) {
      seenFile.add(tab.id)
      files.push({
        id: tab.id,
        title: shortContextPath(tab.path, tab.title),
        language: tab.language,
        body: getText(tab.id)
      })
    }
  }

  return {
    files,
    selections,
    primaryTabId: primaryTabIdFromCapsules(
      capsules.filter((c) => tabs.some((t) => t.id === c.tabId && !isVirtualTab(t)))
    )
  }
}

function selectionOfActive(): SelectionContext | null {
  const editor = getActiveEditor()
  const model = editor?.getModel()
  const sel = editor?.getSelection()
  if (!editor || !model || !sel || sel.isEmpty()) return null
  const from = model.getOffsetAt(sel.getStartPosition())
  const to = model.getOffsetAt(sel.getEndPosition())
  if (to <= from) return null
  return {
    from,
    to,
    text: model.getValueInRange(sel),
    lineFrom: sel.startLineNumber,
    lineTo: sel.endLineNumber
  }
}

/** カプセルが無いときの既定コンテキスト（Ask/Edit=カレント、Agent=全ファイル）。 */
async function resolveDefaultContext(mode: ChatMode): Promise<{
  files: ActiveFileContext[]
  selections: SelectionContext[]
  primaryTabId: string | null
}> {
  const { tabs, activeTabId } = useAppStore.getState()
  const { getText } = await preloadEditor()
  const openFiles = tabs.filter((t) => !isVirtualTab(t))
  const targetIds = new Set(
    defaultContextTabIds({
      mode,
      openTabIds: openFiles.map((t) => t.id),
      activeTabId
    })
  )
  const files: ActiveFileContext[] = openFiles
    .filter((t) => targetIds.has(t.id))
    .map((t) => ({
      id: t.id,
      title: shortContextPath(t.path, t.title),
      language: t.language,
      body: getText(t.id)
    }))

  const selections: SelectionContext[] = []
  if (mode !== 'agent') {
    const active = openFiles.find((t) => t.id === activeTabId)
    const selection = selectionOfActive()
    if (active && selection) {
      selections.push({
        ...selection,
        tabId: active.id,
        title: shortContextPath(active.path, active.title)
      })
    }
  }

  const primaryTabId =
    mode === 'agent'
      ? activeTabId && targetIds.has(activeTabId)
        ? activeTabId
        : (files[0]?.id ?? null)
      : (files[0]?.id ?? null)

  return { files, selections, primaryTabId }
}

async function resolveChatContext(
  mode: ChatMode,
  capsules: readonly ContextCapsule[]
): Promise<{
  files: ActiveFileContext[]
  selections: SelectionContext[]
  primaryTabId: string | null
}> {
  if (capsules.length > 0) return resolveAttachedContext(capsules)
  return resolveDefaultContext(mode)
}

export async function sendChat(): Promise<void> {
  const thread = activeThread()
  if (!thread) return
  const draftParts = thread.draftParts ?? emptyDraftParts()
  if (!draftPartsHaveContent(draftParts)) return
  if (useAppStore.getState().chatBusy) return
  const configured = useAppStore.getState().aiConfigured
  if (!configured) {
    void openSettingsTab('ai-connection')
    return
  }

  const text = plainTextFromDraftParts(draftParts).trim()
  const attached = capsulesFromDraftParts(draftParts)
  const userMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: text,
    createdAt: Date.now(),
    mode: thread.mode,
    context: attached.length > 0 ? attached : undefined,
    parts: draftParts
  }
  const assistantId = crypto.randomUUID()
  const assistantMsg: ChatMessage = {
    id: assistantId,
    role: 'assistant',
    content: '',
    createdAt: Date.now()
  }
  const titled = thread.messages.length === 0 ? titleFromPrompt(text || attached[0]?.title || '新しい会話') : thread.title
  patchActiveThread((t) => ({
    ...t,
    title: titled,
    draftParts: emptyDraftParts(),
    messages: [...t.messages, userMsg, assistantMsg],
    updatedAt: Date.now()
  }))

  const requestId = crypto.randomUUID()
  streamBuf = { requestId, assistantId, text: '' }
  useAppStore.getState().setChatBusy(true, requestId)

  const live = activeThread()
  if (!live) {
    useAppStore.getState().setChatBusy(false, null)
    return
  }
  const { files, selections, primaryTabId } = await resolveChatContext(live.mode, attached)
  const result = await window.coterea.ai.start({
    requestId,
    mode: live.mode,
    activeTabId: primaryTabId,
    messages: buildChatMessages({
      mode: live.mode,
      messages: live.messages.filter((m) => m.id !== assistantId),
      files,
      selections
    })
  })
  if (!result.ok) {
    patchActiveThread((t) => ({
      ...t,
      messages: t.messages.map((m) =>
        m.id === assistantId ? { ...m, content: result.error } : m
      )
    }))
    useAppStore.getState().setChatBusy(false, null)
  }
}

export async function stopChat(): Promise<void> {
  const id = useAppStore.getState().chatRequestId
  if (id) await window.coterea.ai.stop(id)
}

function appendAssistantDelta(requestId: string, text: string): void {
  if (streamBuf.requestId !== requestId) return
  streamBuf.text += text
  const assistantId = streamBuf.assistantId
  patchActiveThread((t) => ({
    ...t,
    messages: t.messages.map((m) => (m.id === assistantId ? { ...m, content: streamBuf.text } : m))
  }))
}

function appendMessage(msg: ChatMessage): void {
  patchActiveThread((t) => ({ ...t, messages: [...t.messages, msg], updatedAt: Date.now() }))
}

function handleEvent(requestId: string, event: AiStreamEvent): void {
  if (useAppStore.getState().chatRequestId && useAppStore.getState().chatRequestId !== requestId) return
  if (event.type === 'delta') {
    if (streamBuf.requestId !== requestId || !streamBuf.assistantId) {
      const assistantId = crypto.randomUUID()
      streamBuf = { requestId, assistantId, text: '' }
      appendMessage({
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: Date.now()
      })
    }
    appendAssistantDelta(requestId, event.text)
    return
  }
  if (event.type === 'tool') {
    streamBuf.assistantId = ''
    streamBuf.text = ''
    appendMessage({
      id: crypto.randomUUID(),
      role: 'tool',
      content: event.detail,
      createdAt: Date.now(),
      toolName: event.name
    })
    return
  }
  if (event.type === 'plan') {
    streamBuf.assistantId = ''
    streamBuf.text = ''
    upsertAgentPlan(event.plan)
    return
  }
  if (event.type === 'proposal') {
    streamBuf.assistantId = ''
    streamBuf.text = ''
    appendMessage({
      id: event.messageId,
      role: 'assistant',
      content: event.note ?? '変更案',
      createdAt: Date.now(),
      proposal: event.proposal,
      proposalStatus: 'pending'
    })
    return
  }
  if (event.type === 'error') {
    if (streamBuf.requestId !== requestId || !streamBuf.assistantId) {
      const assistantId = crypto.randomUUID()
      streamBuf = { requestId, assistantId, text: '' }
      appendMessage({
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: Date.now()
      })
    }
    appendAssistantDelta(requestId, streamBuf.text ? `\n\n${event.message}` : event.message)
    useAppStore.getState().setChatBusy(false, null)
    persistSoon()
    return
  }
  if (event.type === 'done') {
    patchActiveThread((t) => ({
      ...t,
      messages: t.messages.filter((m) => m.proposal || m.content || m.role === 'user' || m.role === 'tool')
    }))
    useAppStore.getState().setChatBusy(false, null)
    persistSoon()
  }
}


function upsertAgentPlan(plan: import('../../../shared/agentPlan').AgentPlanState): void {
  patchActiveThread((t) => {
    const messages = [...t.messages]
    let lastUser = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUser = i
        break
      }
    }
    let planIdx = -1
    for (let i = messages.length - 1; i > lastUser; i--) {
      if (messages[i].agentPlan) {
        planIdx = i
        break
      }
    }
    const open = plan.todos.filter((item) => item.status === 'pending' || item.status === 'in_progress').length
    const done = plan.todos.filter((item) => item.status === 'done').length
    const content = `計画 ${done}/${plan.todos.length} 完了（残り ${open}）`
    if (planIdx >= 0) {
      messages[planIdx] = {
        ...messages[planIdx],
        content,
        agentPlan: plan,
        toolName: 'update_todo',
        role: 'tool'
      }
    } else {
      messages.push({
        id: crypto.randomUUID(),
        role: 'tool',
        content,
        createdAt: Date.now(),
        toolName: 'update_todo',
        agentPlan: plan
      })
    }
    return { ...t, messages, updatedAt: Date.now() }
  })
}

function handleTool(payload: { requestId: string } & AiToolRequest): void {
  const { tabs, activeTabId } = useAppStore.getState()
  const files = tabs.filter((t) => !isVirtualTab(t))
  void (async () => {
    const { getText } = await preloadEditor()
    if (payload.name === 'list_open_tabs') {
      window.coterea.ai.toolResult({
        requestId: payload.requestId,
        callId: payload.callId,
        result: JSON.stringify(files.map((t) => ({ id: t.id, name: t.title, language: t.language })))
      })
      return
    }
    if (payload.name === 'read_tab' || payload.name === 'snapshot_tab') {
      const tabId = resolveOpenTabId({
        requested: payload.tabId,
        tabs: files.map((t) => ({ id: t.id, title: t.title, path: t.path })),
        activeTabId,
        fallbackToActive: false
      })
      const tab = files.find((t) => t.id === tabId)
      if (!tab) {
        window.coterea.ai.toolResult({
          requestId: payload.requestId,
          callId: payload.callId,
          result: JSON.stringify({
            error: files.length === 0 ? '開いているファイルがありません' : 'そのタブは開いていません'
          })
        })
        return
      }
      window.coterea.ai.toolResult({
        requestId: payload.requestId,
        callId: payload.callId,
        result: JSON.stringify({ id: tab.id, title: tab.title, language: tab.language, content: getText(tab.id) })
      })
    }
  })()
}

export function attachAiListeners(): () => void {
  if (listenersAttached) return () => undefined
  listenersAttached = true
  const offEvent = window.coterea.ai.onEvent(({ requestId, event }) => handleEvent(requestId, event))
  const offTool = window.coterea.ai.onTool((payload) => handleTool(payload))
  const offStatus = window.coterea.ai.onStatus((status) => useAppStore.getState().setAiStatus(status))
  const offUsage = window.coterea.ai.usage.onChange((usage) => useAppStore.getState().setAiUsage(usage))
  return () => {
    listenersAttached = false
    offEvent()
    offTool()
    offStatus()
    offUsage()
  }
}

export async function applyProposal(messageId: string, _force = false): Promise<void> {
  const thread = activeThread()
  const msg = thread?.messages.find((m) => m.id === messageId)
  const proposal = msg?.proposal
  if (!proposal || !thread) return
  const { getText, applyDocumentText } = await preloadEditor()
  const tab = useAppStore.getState().tabs.find((t) => t.id === proposal.tabId)
  if (!tab || isVirtualTab(tab)) {
    patchActiveThread((t) => ({
      ...t,
      messages: t.messages.map((m) =>
        m.id === messageId ? { ...m, proposalStatus: 'conflict', content: `${m.content}\n（タブが開いていません）` } : m
      )
    }))
    return
  }
  const current = getText(proposal.tabId)
  applyDocumentText(proposal.tabId, desiredTextAfterProposal(current, proposal))
  markDirty(proposal.tabId)
  patchActiveThread((t) => ({
    ...t,
    messages: t.messages.map((m) => (m.id === messageId ? { ...m, proposalStatus: 'applied' } : m))
  }))
  persistSoon()
}

export async function rejectProposal(messageId: string): Promise<void> {
  patchActiveThread((t) => ({
    ...t,
    messages: t.messages.map((m) => (m.id === messageId ? { ...m, proposalStatus: 'rejected' } : m))
  }))
  persistSoon()
}

export async function applyAllPending(force = false): Promise<void> {
  const thread = activeThread()
  if (!thread) return
  for (const msg of thread.messages) {
    if (msg.proposal && (msg.proposalStatus === 'pending' || (force && msg.proposalStatus === 'conflict'))) {
      await applyProposal(msg.id, force)
    }
  }
}