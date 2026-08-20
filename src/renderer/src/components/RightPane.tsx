import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatedEllipsis } from './AnimatedEllipsis'
import { ChatMessageContent } from './ChatMessageContent'
import {
  groupChatTurns,
  proposalResultLabel,
  toolDisplayName,
  toolIcon,
  turnNeedsBusyEllipsis,
  type ChatAssistantTurn
} from '../lib/chatTurns'
import { OverlayScroll } from './OverlayScroll'
import { openSettingsTab } from '../lib/actions'
import {
  applyAllPending,
  closeAllThreads,
  closeOtherThreads,
  applyProposal,
  closeThread,
  deleteThreadHistory,
  historyChatThreads,
  insertDraftCapsule,
  newThread,
  openChatThreads,
  rejectProposal,
  renameThread,
  reopenThread,
  reorderOpenThread,
  selectThread,
  sendChat,
  setDraftParts,
  setThreadMode,
  stopChat
} from '../lib/chat'
import { ChatComposerInput } from './ChatComposerInput'
import {
  endContextPointerDrag,
  getContextPointerPayload,
  isContextPointerDragging,
  subscribeContextPointerDrag
} from '../lib/contextDrag'
import { scrollActiveTabIntoView } from '../lib/tabScroll'
import {
  CHAT_TAB_REORDER_MIME,
  dropInsertIndex,
  dropSide
} from '../../../shared/tabOrder'
import { useAppStore } from '../store'
import { diffLines, previewTexts } from '../../../shared/lineDiff'
import type { ChatMessage, ChatMode, ContextCapsule, DraftPart, ProposedEdit } from '../../../shared/ai'
import {
  CHAT_CONTEXT_MIME,
  capsuleFromDrag,
  capsuleLabel,
  emptyDraftParts,
  readChatContextDrag
} from '../../../shared/chatContext'
import { CHAT_MODES, chatModeUi } from '../../../shared/chatMode'
import {
  getOpenTodos,
  shouldHintCoarseAgentPlan,
  shouldShowAgentPlanPanel,
  type AgentPlanState,
  type AgentTodoItem
} from '../../../shared/agentPlan'

export function RightPane(): React.JSX.Element {
  const chat = useAppStore((s) => s.chat)
  const busy = useAppStore((s) => s.chatBusy)
  const configured = useAppStore((s) => s.aiConfigured)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; threadId: string } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<{ id: string; side: 'before' | 'after' } | null>(null)
  const chatTabScrollRef = useRef<HTMLDivElement>(null)
  const openThreads = openChatThreads(chat.threads)
  const thread = openThreads.find((t) => t.id === chat.activeId) ?? openThreads[0]
  const pending = thread?.messages.filter((m) => m.proposal && m.proposalStatus === 'pending') ?? []
  const chatTabsKey = openThreads.map((t) => `${t.id}:${t.title}`).join('|')

  useLayoutEffect(() => {
    if (!thread) return
    scrollActiveTabIntoView(chatTabScrollRef.current, '.chat-tab.active')
  }, [thread?.id, chatTabsKey])

  const clearDrag = (): void => {
    setDraggingId(null)
    setDropHint(null)
  }

  const acceptReorder = (fromId: string, overId: string, clientX: number, el: HTMLElement): void => {
    const from = openThreads.findIndex((t) => t.id === fromId)
    const over = openThreads.findIndex((t) => t.id === overId)
    if (from < 0 || over < 0 || fromId === overId) return
    const to = dropInsertIndex(from, over, clientX, el.getBoundingClientRect())
    if (to === from) return
    reorderOpenThread(fromId, to)
  }

  return (
    <aside className="right-pane chat-pane">
      {thread && (
        <div className="chat-tabbar" role="tablist">
          <div
            className="chat-tabbar-scroll"
            ref={chatTabScrollRef}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return
              setDropHint(null)
            }}
          >
            {openThreads.map((item) => {
              const selected = item.id === thread.id
              const hint = dropHint?.id === item.id ? dropHint.side : null
              return (
                <div
                  key={item.id}
                  className={`chat-tab${selected ? ' active' : ''}${
                    draggingId === item.id ? ' is-dragging' : ''
                  }${hint === 'before' ? ' drop-before' : ''}${hint === 'after' ? ' drop-after' : ''}`}
                  role="tab"
                  aria-selected={selected}
                  draggable={renaming !== item.id}
                  onDragStart={(e) => {
                    if (renaming === item.id) {
                      e.preventDefault()
                      return
                    }
                    setDraggingId(item.id)
                    e.dataTransfer.setData(CHAT_TAB_REORDER_MIME, item.id)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setDragImage(
                      e.currentTarget,
                      Math.min(40, e.currentTarget.clientWidth / 2),
                      e.currentTarget.clientHeight / 2
                    )
                  }}
                  onDragEnd={clearDrag}
                  onDragOver={(e) => {
                    if (![...e.dataTransfer.types].includes(CHAT_TAB_REORDER_MIME)) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (draggingId === item.id) {
                      setDropHint(null)
                      return
                    }
                    setDropHint({
                      id: item.id,
                      side: dropSide(e.clientX, e.currentTarget.getBoundingClientRect())
                    })
                  }}
                  onDrop={(e) => {
                    const fromId = e.dataTransfer.getData(CHAT_TAB_REORDER_MIME)
                    if (!fromId) return
                    e.preventDefault()
                    e.stopPropagation()
                    acceptReorder(fromId, item.id, e.clientX, e.currentTarget)
                    clearDrag()
                  }}
                  onClick={() => selectThread(item.id)}
                  onDoubleClick={() => setRenaming(item.id)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setCtxMenu({ x: e.clientX, y: e.clientY, threadId: item.id })
                  }}
                >
                  {renaming === item.id ? (
                    <input
                      className="chat-rename"
                      defaultValue={item.title}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        renameThread(item.id, e.target.value)
                        setRenaming(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          renameThread(item.id, (e.target as HTMLInputElement).value)
                          setRenaming(null)
                        }
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                    />
                  ) : (
                    <span className="chat-tab-title" title={item.title}>
                      {item.title}
                    </span>
                  )}
                  <button
                    className="tab-close"
                    type="button"
                    aria-label={`${item.title} を閉じる`}
                    onClick={(e) => {
                      e.stopPropagation()
                      closeThread(item.id)
                    }}
                  >
                    <span className="tab-close-x" aria-hidden>
                      ×
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
          <div className="chat-header-actions">
            <ChatHistoryPicker />
            <button className="btn-icon" type="button" title="新しい会話" aria-label="新しい会話" onClick={() => newThread()}>
              <PlusIcon />
            </button>
          </div>
        </div>
      )}
      {ctxMenu ? (
        <ChatTabContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          threadId={ctxMenu.threadId}
          hasOthers={openThreads.length > 1}
          onClose={() => setCtxMenu(null)}
        />
      ) : null}

      <ChatLog messages={thread?.messages ?? []} busy={busy} />

      {pending.length > 1 && (
        <div className="chat-batch">
          <button type="button" className="primary" onClick={() => void applyAllPending(false)}>
            一括適用（{pending.length}）
          </button>
        </div>
      )}

      {thread && (
        <div className="chat-composer">
          {!configured && (
            <p className="muted small">
              API が未設定です。
              <button type="button" className="linkish" onClick={() => openSettingsTab('ai-connection')}>
                設定を開く
              </button>
            </p>
          )}
          <ChatComposerBox
            draftParts={thread.draftParts ?? emptyDraftParts()}
            mode={thread.mode}
            busy={busy}
            configured={configured}
          />
        </div>
      )}
      <ContextDragGhost />
    </aside>
  )
}

function ChatComposerBox({
  draftParts,
  mode,
  busy,
  configured
}: {
  draftParts: DraftPart[]
  mode: ChatMode
  busy: boolean
  configured: boolean
}): React.JSX.Element {
  const [dragOver, setDragOver] = useState(false)
  const [pointerOver, setPointerOver] = useState(false)
  const [pointerDragging, setPointerDragging] = useState(false)

  useEffect(() => subscribeContextPointerDrag(() => setPointerDragging(isContextPointerDragging())), [])

  const acceptPayload = (
    payload: ReturnType<typeof readChatContextDrag>,
    clientX?: number,
    clientY?: number
  ): void => {
    if (!payload || busy) return
    insertDraftCapsule(capsuleFromDrag(payload), clientX, clientY)
  }

  const dropActive = dragOver || (pointerDragging && pointerOver)

  return (
    <div
      className={`chat-input-box${dropActive ? ' is-drop-target' : ''}`}
      onDragEnter={(e) => {
        if (![...e.dataTransfer.types].includes(CHAT_CONTEXT_MIME)) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes(CHAT_CONTEXT_MIME)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setDragOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        acceptPayload(readChatContextDrag(e.dataTransfer), e.clientX, e.clientY)
      }}
      onMouseEnter={() => {
        if (isContextPointerDragging()) setPointerOver(true)
      }}
      onMouseLeave={() => setPointerOver(false)}
      onMouseUp={(e) => {
        if (!isContextPointerDragging()) return
        const payload = endContextPointerDrag()
        setPointerOver(false)
        acceptPayload(payload, e.clientX, e.clientY)
      }}
    >
      {dropActive ? (
        <p className="chat-context-hint is-active">カーソル位置にドロップして挿入</p>
      ) : null}
      <ChatComposerInput
        parts={draftParts}
        placeholder={chatModeUi(mode).placeholder}
        disabled={busy}
        onPartsChange={setDraftParts}
        onSubmit={() => void sendChat()}
      />
      <div className="chat-input-footer">
        <div className="chat-input-footer-controls">
          <ChatModePicker mode={mode} busy={busy} />
        </div>
        {busy ? (
          <button type="button" className="btn-send btn-stop" onClick={() => void stopChat()}>
            停止
          </button>
        ) : (
          <button type="button" className="btn-send" onClick={() => void sendChat()} disabled={!configured}>
            送信
          </button>
        )}
      </div>
    </div>
  )
}

function ContextChip({
  capsule,
  disabled,
  onRemove
}: {
  capsule: ContextCapsule
  disabled?: boolean
  onRemove?: () => void
}): React.JSX.Element {
  const label = capsuleLabel(capsule)
  return (
    <span className={`chat-context-chip kind-${capsule.kind}`} title={label}>
      <span className="chat-context-chip-icon" aria-hidden>
        {capsule.kind === 'file' ? '📄' : '≡'}
      </span>
      <span className="chat-context-chip-label">{label}</span>
      {onRemove ? (
        <button
          type="button"
          className="chat-context-chip-remove"
          aria-label={`${label} を外す`}
          disabled={disabled}
          onClick={onRemove}
        >
          ×
        </button>
      ) : null}
    </span>
  )
}

function ContextDragGhost(): React.JSX.Element | null {
  const [state, setState] = useState<{ active: boolean; label: string; x: number; y: number }>({
    active: false,
    label: '',
    x: 0,
    y: 0
  })

  useEffect(() => {
    const sync = (): void => {
      const payload = getContextPointerPayload()
      if (!payload || !isContextPointerDragging()) {
        setState((s) => (s.active ? { ...s, active: false } : s))
        return
      }
      const label = capsuleLabel(capsuleFromDrag(payload))
      setState((s) => ({ ...s, active: true, label }))
    }
    const onMove = (e: MouseEvent): void => {
      if (!isContextPointerDragging()) return
      setState((s) => ({ ...s, active: true, x: e.clientX, y: e.clientY }))
    }
    const off = subscribeContextPointerDrag(sync)
    window.addEventListener('mousemove', onMove, true)
    sync()
    return () => {
      off()
      window.removeEventListener('mousemove', onMove, true)
    }
  }, [])

  if (!state.active) return null
  return (
    <div className="chat-context-ghost" style={{ left: state.x + 12, top: state.y + 12 }} aria-hidden>
      <span className="chat-context-chip kind-selection">
        <span className="chat-context-chip-icon">≡</span>
        <span className="chat-context-chip-label">{state.label}</span>
      </span>
    </div>
  )
}

function iconProps() {
  return {
    width: 18,
    height: 18,
    viewBox: '0 0 16 16',
    fill: 'none',
    'aria-hidden': true as const
  }
}

function ChatHistoryIcon(): React.JSX.Element {
  return (
    <svg {...iconProps()}>
      <path
        d="M2.5 8A5.5 5.5 0 1 0 4.2 4.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M2 2.5v3h3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 5.5V8l1.8 1.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg {...iconProps()}>
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function ChatTabContextMenu({
  x,
  y,
  threadId,
  hasOthers,
  onClose
}: {
  x: number
  y: number
  threadId: string
  hasOthers: boolean
  onClose: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const run = (fn: () => void): void => {
    onClose()
    fn()
  }

  return (
    <div ref={ref} className="tab-ctx-menu" style={{ left: x, top: y }} role="menu">
      <button type="button" role="menuitem" onClick={() => run(() => closeThread(threadId))}>
        閉じる
      </button>
      {hasOthers ? (
        <button type="button" role="menuitem" onClick={() => run(() => closeOtherThreads(threadId))}>
          他を閉じる
        </button>
      ) : null}
      <button type="button" role="menuitem" onClick={() => run(() => closeAllThreads())}>
        すべて閉じる
      </button>
    </div>
  )
}

function ChatHistoryPicker(): React.JSX.Element {
  const chat = useAppStore((s) => s.chat)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const items = historyChatThreads(chat.threads)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="chat-history-picker" ref={wrapRef}>
      <button
        className="btn-icon"
        type="button"
        title="過去の会話"
        aria-label="過去の会話"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <ChatHistoryIcon />
      </button>
      {open ? (
        <div className="chat-history-menu" role="dialog" aria-label="過去の会話">
          {items.length === 0 ? (
            <p className="muted small">まだ会話がありません</p>
          ) : (
            items.map((item) => {
              const selected = item.id === chat.activeId
              return (
                <div key={item.id} className={`chat-history-row${selected ? ' selected' : ''}`}>
                  <button
                    type="button"
                    className="chat-history-open"
                    onClick={() => {
                      reopenThread(item.id)
                      setOpen(false)
                    }}
                  >
                    <span className="chat-history-title">{item.title}</span>
                    <span className="chat-history-meta">
                      {new Date(item.updatedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="tab-close"
                    aria-label={`${item.title} を履歴から削除`}
                    onClick={() => deleteThreadHistory(item.id)}
                  >
                    <span className="tab-close-x" aria-hidden>
                      ×
                    </span>
                  </button>
                </div>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}

function ChatModePicker({ mode, busy }: { mode: ChatMode; busy: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const active = chatModeUi(mode)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className="chat-mode-picker" ref={wrapRef}>
      <button
        type="button"
        className={`chat-mode-trigger mode-${mode}`}
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        title={active.title}
        aria-label="送信モード"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="chat-mode-dot" aria-hidden />
        <span className="chat-mode-trigger-label">{active.label}</span>
        <span className="chat-mode-chevron" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="chat-mode-menu" role="listbox" aria-label="送信モード">
          {CHAT_MODES.map((option) => {
            const selected = option.id === mode
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`chat-mode-menu-item mode-${option.id}${selected ? ' selected' : ''}`}
                title={option.title}
                onClick={() => {
                  setThreadMode(option.id)
                  setOpen(false)
                }}
              >
                <span className="chat-mode-dot" aria-hidden />
                <span>{option.label}</span>
                {selected ? (
                  <span className="chat-mode-menu-check" aria-hidden>
                    ✓
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function ChatLog({ messages, busy }: { messages: ChatMessage[]; busy: boolean }): React.JSX.Element {
  const turns = groupChatTurns(messages, busy)
  return (
    <OverlayScroll
      className="chat-log"
      viewClassName="chat-messages"
      innerClassName="chat-messages-inner"
      pinToBottom
      pinKey={messages}
    >
      {messages.length === 0 && (
        <div className="chat-empty">
          <p>いま開いている文書について、質問したり書き換えを依頼できます</p>
          <p className="hint">
            送信前にモードを選べます。{CHAT_MODES.map((item) => `${item.label} は${item.summary}`).join('。')}。
          </p>
          <p className="hint">カプセル未添付なら Ask / Edit はカレントタブ、Agent は開いている全ファイルを使います</p>
        </div>
      )}
      {turns.map((turn) => {
        if (turn.kind === 'user') {
          return <UserBubble key={turn.message.id} msg={turn.message} />
        }
        return <AssistantTurnFrame key={turn.id} turn={turn} />
      })}
    </OverlayScroll>
  )
}

function modeLabel(mode: ChatMode | undefined): string | null {
  if (!mode) return null
  return chatModeUi(mode).label
}

function UserBubble({ msg }: { msg: ChatMessage }): React.JSX.Element {
  return (
    <div className="chat-message user">
      <div className="chat-role">
        <span>あなた</span>
        {modeLabel(msg.mode) ? <span className={`chat-message-mode ${msg.mode}`}>{modeLabel(msg.mode)}</span> : null}
      </div>
      <div className="chat-content">
        {msg.parts && msg.parts.some((p) => p.type === 'capsule') ? (
          <UserMessageParts parts={msg.parts} />
        ) : (
          <>
            {msg.context && msg.context.length > 0 ? (
              <div className="chat-context-chips in-message" aria-label="添付コンテキスト">
                {msg.context.map((capsule) => (
                  <ContextChip key={capsule.id} capsule={capsule} />
                ))}
              </div>
            ) : null}
            <ChatMessageContent content={msg.content} />
          </>
        )}
      </div>
    </div>
  )
}

function AssistantTurnFrame({ turn }: { turn: ChatAssistantTurn }): React.JSX.Element {
  const showBusy = turnNeedsBusyEllipsis(turn)
  const lastText = turn.texts[turn.texts.length - 1]
  const streamingTextId = turn.isActive && lastText && !lastText.content.trim() ? lastText.id : null
  const streamingContentId =
    turn.isActive && lastText && lastText.content.trim() ? lastText.id : streamingTextId
  const hasTimeline = turn.tools.length > 0 || turn.settledProposals.length > 0

  return (
    <div className="chat-message assistant">
      <div className="chat-role">
        <span>AI</span>
        {modeLabel(turn.requestMode) ? (
          <span className={`chat-message-mode ${turn.requestMode}`}>{modeLabel(turn.requestMode)}</span>
        ) : null}
      </div>
      <div className="chat-content">
        {turn.plan && shouldShowAgentPlanPanel(turn.plan) ? <AgentPlanPanel plan={turn.plan} /> : null}
        {hasTimeline ? (
          <ToolStepsPanel tools={turn.tools} settledProposals={turn.settledProposals} />
        ) : null}
        {turn.texts.map((textMsg) => (
          <ChatMessageContent
            key={textMsg.id}
            content={textMsg.content}
            isStreaming={turn.isActive && textMsg.id === streamingContentId}
          />
        ))}
        {turn.openProposals.map((propMsg) =>
          propMsg.proposal ? (
            <ProposalCard key={propMsg.id} msg={propMsg} proposal={propMsg.proposal} />
          ) : null
        )}
        {showBusy ? (
          <span className="chat-streaming chat-turn-busy" aria-live="polite" aria-label="生成中">
            <AnimatedEllipsis />
          </span>
        ) : null}
      </div>
    </div>
  )
}

function ToolStepsPanel({
  tools,
  settledProposals
}: {
  tools: ChatMessage[]
  settledProposals: ChatMessage[]
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const count = tools.length + settledProposals.length
  const applied = settledProposals.filter((m) => m.proposalStatus === 'applied').length
  const rejected = settledProposals.filter((m) => m.proposalStatus === 'rejected').length
  const metaParts = ['完了']
  if (applied > 0) metaParts.push(`適用 ${applied}`)
  if (rejected > 0) metaParts.push(`拒否 ${rejected}`)
  return (
    <div className="agent-step-timeline">
      <div className="chat-code-block agent-step-block agent-step-quiet-summary">
        <button
          type="button"
          className="chat-code-header"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="chat-code-chevron">{open ? '▼' : '▶'}</span>
          <span className="chat-code-icon" aria-hidden>
            🔧
          </span>
          <span className="chat-code-label">ツール {count}件</span>
          <span className="chat-code-meta">{metaParts.join(' · ')}</span>
        </button>
        {open ? (
          <div className="agent-step-group-body">
            {tools.map((tool) => (
              <ToolStepRow key={tool.id} msg={tool} />
            ))}
            {settledProposals.map((propMsg) => (
              <SettledProposalRow key={propMsg.id} msg={propMsg} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ToolStepRow({ msg }: { msg: ChatMessage }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const body = msg.content.trim()
  const canExpand = body.length > 0
  const label = toolDisplayName(msg.toolName)
  const icon = toolIcon(msg.toolName)
  const header = (
    <>
      <span className="chat-code-chevron">{canExpand ? (open ? '▼' : '▶') : '·'}</span>
      <span className="chat-code-icon" aria-hidden>
        {icon}
      </span>
      <span className="chat-code-label">{label}</span>
      <span className="chat-code-meta">完了</span>
    </>
  )
  return (
    <div className="chat-code-block agent-step-block agent-step-done">
      {canExpand ? (
        <button type="button" className="chat-code-header" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {header}
        </button>
      ) : (
        <div className="chat-code-header static">{header}</div>
      )}
      {open && canExpand ? <pre className="chat-code-body">{body}</pre> : null}
    </div>
  )
}

function SettledProposalRow({ msg }: { msg: ChatMessage }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const proposal = msg.proposal
  const status = msg.proposalStatus ?? 'pending'
  const title = proposal?.tabTitle || proposal?.tabId || '変更'
  const note = proposal?.note?.trim() || msg.content.trim() || 'ファイル変更'
  const meta = proposalResultLabel(status)
  const statusClass =
    status === 'applied' ? 'agent-step-done' : status === 'rejected' ? 'agent-step-cancelled' : 'agent-step-done'
  return (
    <div className={`chat-code-block agent-step-block ${statusClass}`}>
      <button type="button" className="chat-code-header" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="chat-code-chevron">{open ? '▼' : '▶'}</span>
        <span className="chat-code-icon" aria-hidden>
          📄
        </span>
        <span className="chat-code-label">{title}</span>
        <span className="chat-code-meta">{meta}</span>
      </button>
      {open ? (
        <div className="agent-step-settled-body">
          <p className="chat-actions-hint">{note}</p>
          {proposal ? <ProposalCard msg={msg} proposal={proposal} compact /> : null}
        </div>
      ) : null}
    </div>
  )
}

function UserMessageParts({ parts }: { parts: DraftPart[] }): React.JSX.Element {
  return (
    <div className="chat-user-parts">
      {parts.map((part, index) => {
        if (part.type === 'capsule') {
          return <ContextChip key={part.capsule.id} capsule={part.capsule} />
        }
        if (!part.text) return null
        return (
          <span key={`t-${index}`} className="chat-user-part-text">
            {part.text}
          </span>
        )
      })}
    </div>
  )
}

function statusMark(status: AgentTodoItem['status']): string {
  switch (status) {
    case 'done':
      return '✓'
    case 'cancelled':
      return '–'
    case 'in_progress':
      return '…'
    default:
      return '○'
  }
}

function AgentPlanPanel({ plan }: { plan: AgentPlanState }): React.JSX.Element {
  const open = getOpenTodos(plan)
  const done = plan.todos.filter((todo) => todo.status === 'done').length
  const showCoarseHint = shouldHintCoarseAgentPlan(plan)
  return (
    <div className={`agent-plan-panel${showCoarseHint ? ' is-coarse' : ''}`} aria-label="計画">
      <div className="agent-plan-header">
        <span className="agent-plan-title">計画</span>
        {plan.todos.length > 0 ? (
          <span className="agent-plan-progress">
            {done}/{plan.todos.length} 完了（残り {open.length}）
          </span>
        ) : null}
      </div>
      {showCoarseHint ? (
        <div className="agent-plan-coarse-hint" role="note">
          項目が粗いようです。成果物や完了条件が分かる書き方にすると進みやすいです。
        </div>
      ) : null}
      {plan.todos.length > 0 ? (
        <ul className="agent-plan-list">
          {plan.todos.map((todo) => (
            <li
              key={todo.id}
              className={`agent-plan-item status-${todo.status}`}
              title={`${todo.id}: ${todo.content}`}
            >
              <span className="agent-plan-mark" aria-hidden="true">
                {statusMark(todo.status)}
              </span>
              <span className="agent-plan-item-text">{todo.content}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function ProposalCard({ msg, proposal, compact = false }: { msg: ChatMessage; proposal: ProposedEdit; compact?: boolean }): React.JSX.Element {
  const { before, after } = previewTexts(proposal)
  const lines = diffLines(before, after)
  const status = msg.proposalStatus ?? 'pending'
  const meta =
    (proposal.mode === 'replace_all' ? 'ファイル全体' : '範囲') +
    (status === 'applied' ? ' · 適用済み' : status === 'rejected' ? ' · 拒否' : status === 'conflict' ? ' · 衝突' : '')
  return (
    <div className={`chat-code-block actions${status === 'pending' || status === 'conflict' ? '' : ' is-settled'}${compact ? ' is-compact' : ''}`}>
      <div className="chat-code-header static">
        <span className="chat-code-icon" aria-hidden>
          📄
        </span>
        <span className="chat-code-label">{proposal.tabTitle || proposal.tabId}</span>
        <span className="chat-code-meta">{meta}</span>
      </div>
      {proposal.note ? <p className="chat-actions-hint">{proposal.note}</p> : null}
      <pre className="chat-code-body diff-body">
        {lines.map((line, i) => (
          <div key={i} className={`diff-${line.type}`}>
            {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
            {line.text}
          </div>
        ))}
      </pre>
      {status === 'pending' && (
        <div className="diff-actions">
          <button type="button" className="primary" onClick={() => void applyProposal(msg.id)}>
            適用
          </button>
          <button type="button" onClick={() => void rejectProposal(msg.id)}>
            拒否
          </button>
        </div>
      )}
      {status === 'conflict' && (
        <div className="diff-actions">
          <p className="warn small">プレビュー後に文書が変わっています。上書きするかやり直してください。</p>
          <button type="button" className="primary" onClick={() => void applyProposal(msg.id, true)}>
            上書き適用
          </button>
          <button type="button" onClick={() => void rejectProposal(msg.id)}>
            拒否
          </button>
        </div>
      )}
    </div>
  )
}

