import {
  cannotDeleteLastThread,
  classifyApplyCollision,
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
  resolveOpenTabId,
  type ActiveFileContext,
  type SelectionContext
} from '../../../shared/chatMode'
import { markDirty } from './collab'
import { preloadEditor } from './editorReady'
import { getActiveEditor } from './editorHandle'
import { openSettingsTab, setCollabPaneVisible } from './actions'
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

export async function loadChat(): Promise<void> {
  const history = await window.coterea.chat.get()
  let { threads, activeId } = history
  let open = openChatThreads(threads)
  if (open.length === 0) {
    const fresh = emptyThread(crypto.randomUUID())
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
  const thread = emptyThread(crypto.randomUUID())
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

export function closeThread(id: string): void {
  const chat = useAppStore.getState().chat
  const target = chat.threads.find((t) => t.id === id)
  if (!target) return
  const openThreads = openChatThreads(chat.threads)
  const hasContent = target.messages.some((m) => m.role === 'user' || m.content)

  if (!hasContent) {
    if (cannotDeleteLastThread(openThreads.length)) {
      patchActiveThread((t) => ({ ...t, title: '新しい会話', messages: [], draft: '', updatedAt: Date.now(), open: true }))
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
      const fresh = emptyThread(crypto.randomUUID())
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
  if (threads.length === 0) threads = [emptyThread(crypto.randomUUID())]
  if (openChatThreads(threads).length === 0) {
    const fresh = emptyThread(crypto.randomUUID())
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
}

export function setDraft(draft: string): void {
  patchActiveThread((t) => ({ ...t, draft }))
}

function selectionOfActive(): SelectionContext | null {
  const editor = getActiveEditor()
  const model = editor?.getModel()
  const sel = editor?.getSelection()
  if (!editor || !model || !sel || sel.isEmpty()) return null
  const from = model.getOffsetAt(sel.getStartPosition())
  const to = model.getOffsetAt(sel.getEndPosition())
  if (to <= from) return null
  return { from, to, text: model.getValueInRange(sel) }
}

async function snapshotWorkspace(): Promise<{
  activeFile: ActiveFileContext | null
  selection: SelectionContext | null
}> {
  const { tabs, activeTabId } = useAppStore.getState()
  const tab = tabs.find((t) => t.id === activeTabId)
  const { getText } = await preloadEditor()
  const selection = selectionOfActive()
  if (!tab || isVirtualTab(tab)) return { activeFile: null, selection: null }
  return {
    activeFile: { id: tab.id, title: tab.title, language: tab.language, body: getText(tab.id) },
    selection
  }
}

export async function sendChat(): Promise<void> {
  const thread = activeThread()
  if (!thread) return
  const text = (thread.draft ?? '').trim()
  if (!text) return
  if (useAppStore.getState().chatBusy) return
  const configured = useAppStore.getState().aiConfigured
  if (!configured) {
    void openSettingsTab('ai-connection')
    return
  }

  const userMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: text,
    createdAt: Date.now(),
    mode: thread.mode
  }
  const assistantId = crypto.randomUUID()
  const assistantMsg: ChatMessage = {
    id: assistantId,
    role: 'assistant',
    content: '',
    createdAt: Date.now()
  }
  const titled = thread.messages.length === 0 ? titleFromPrompt(text) : thread.title
  patchActiveThread((t) => ({
    ...t,
    title: titled,
    draft: '',
    messages: [...t.messages, userMsg, assistantMsg],
    updatedAt: Date.now()
  }))

  const requestId = crypto.randomUUID()
  streamBuf = { requestId, assistantId, text: '' }
  useAppStore.getState().setChatBusy(true, requestId)

  const { activeFile, selection } = await snapshotWorkspace()
  const live = activeThread()
  if (!live) {
    useAppStore.getState().setChatBusy(false, null)
    return
  }
  const result = await window.coterea.ai.start({
    requestId,
    mode: live.mode,
    activeTabId: activeFile?.id ?? null,
    messages: buildChatMessages({
      mode: live.mode,
      messages: live.messages.filter((m) => m.id !== assistantId),
      activeFile,
      selection
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

export async function applyProposal(messageId: string, force = false): Promise<void> {
  const thread = activeThread()
  const msg = thread?.messages.find((m) => m.id === messageId)
  const proposal = msg?.proposal
  if (!proposal || !thread) return
  const { getText, applyLocalEdit } = await preloadEditor()
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
  const collision = classifyApplyCollision({ current, proposal })
  if (collision !== 'ok' && !force) {
    patchActiveThread((t) => ({
      ...t,
      messages: t.messages.map((m) => (m.id === messageId ? { ...m, proposalStatus: 'conflict' } : m))
    }))
    persistSoon()
    return
  }
  if (proposal.mode === 'replace_all') {
    applyLocalEdit(proposal.tabId, 0, current.length, proposal.text)
  } else {
    const from = proposal.from ?? 0
    const to = proposal.to ?? 0
    applyLocalEdit(proposal.tabId, from, to, proposal.text)
  }
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