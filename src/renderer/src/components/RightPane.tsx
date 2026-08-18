import { useEffect, useRef, useState } from 'react'
import { OverlayScroll } from './OverlayScroll'
import { openSettingsTab } from '../lib/actions'
import {
  applyAllPending,
  applyProposal,
  closeThread,
  deleteThreadHistory,
  historyChatThreads,
  newThread,
  openChatThreads,
  rejectProposal,
  renameThread,
  reopenThread,
  selectThread,
  sendChat,
  setDraft,
  setThreadMode,
  stopChat
} from '../lib/chat'
import { useAppStore } from '../store'
import { diffLines, previewTexts } from '../../../shared/lineDiff'
import type { ChatMessage, ChatMode, ProposedEdit } from '../../../shared/ai'

const MODES: { id: ChatMode; label: string; title: string; placeholder: string }[] = [
  { id: 'ask', label: 'Ask', title: 'このメッセージを Ask モードで送信（質問への回答のみ。文書は変わりません）', placeholder: 'いまの文書について質問する... (Enterで送信, Shift+Enterで改行)' },
  { id: 'edit', label: 'Edit', title: 'このメッセージを Edit モードで送信（いまのファイルへの変更案を1つ提案）', placeholder: 'いまの文書の執筆・修正・整理を依頼... (Enterで送信, Shift+Enterで改行)' },
  { id: 'agent', label: 'Agent', title: 'このメッセージを Agent モードで送信（開いているタブを読んで調査・変更を提案）', placeholder: '開いている文書を調査・説明... (Enterで送信, Shift+Enterで改行)' }
]

export function RightPane(): React.JSX.Element {
  const chat = useAppStore((s) => s.chat)
  const busy = useAppStore((s) => s.chatBusy)
  const configured = useAppStore((s) => s.aiConfigured)
  const [renaming, setRenaming] = useState<string | null>(null)
  const openThreads = openChatThreads(chat.threads)
  const thread = openThreads.find((t) => t.id === chat.activeId) ?? openThreads[0]
  const pending = thread?.messages.filter((m) => m.proposal && m.proposalStatus === 'pending') ?? []

  return (
    <aside className="right-pane chat-pane">
      {thread && (
        <div className="chat-tabbar" role="tablist">
          <div className="chat-tabbar-scroll">
            {openThreads.map((item) => {
              const selected = item.id === thread.id
              return (
                <div
                  key={item.id}
                  className={`chat-tab${selected ? ' active' : ''}`}
                  role="tab"
                  aria-selected={selected}
                  onClick={() => selectThread(item.id)}
                  onDoubleClick={() => setRenaming(item.id)}
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
              <button type="button" className="linkish" onClick={() => openSettingsTab('ai')}>
                設定を開く
              </button>
            </p>
          )}
          <div className="chat-input-box">
            <textarea
              className="chat-input"
              value={thread.draft ?? ''}
              placeholder={(MODES.find((m) => m.id === thread.mode) ?? MODES[0]).placeholder}
              rows={3}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void sendChat()
                }
              }}
            />
            <div className="chat-input-footer">
              <div className="chat-input-footer-controls">
                <ChatModePicker mode={thread.mode} busy={busy} />
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
        </div>
      )}
    </aside>
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
  const active = MODES.find((item) => item.id === mode) ?? MODES[0]

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
          {MODES.map((option) => {
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
            送信前に Ask / Edit / Agent を選べます。Ask は説明のみ（文書は変わりません）。Edit はいまのファイルへの変更案を1つ出します。Agent は開いているタブを読んで、複数の変更案を出せます
          </p>
          <p className="hint">Ask / Edit では現在のファイルが、Agent では開いているタブが自動でコンテキストに入ります</p>
        </div>
      )}
      {messages.map((msg, index) => {
        const requestMode =
          msg.role === 'user'
            ? msg.mode
            : [...messages.slice(0, index)].reverse().find((item) => item.role === 'user')?.mode
        const isStreaming = busy && index === messages.length - 1 && msg.role === 'assistant' && !msg.proposal
        return <ChatBubble key={msg.id} msg={msg} requestMode={requestMode} isStreaming={isStreaming} />
      })}
    </OverlayScroll>
  )
}

function modeLabel(mode: ChatMode | undefined): string | null {
  if (!mode) return null
  return MODES.find((item) => item.id === mode)?.label ?? mode
}

function ChatBubble({
  msg,
  requestMode,
  isStreaming
}: {
  msg: ChatMessage
  requestMode?: ChatMode
  isStreaming?: boolean
}): React.JSX.Element {
  if (msg.proposal) {
    return (
      <div className="chat-message assistant">
        <div className="chat-role">
          <span>AI</span>
          {modeLabel(requestMode) ? <span className={`chat-message-mode ${requestMode}`}>{modeLabel(requestMode)}</span> : null}
        </div>
        <div className="chat-content">
          <ProposalCard msg={msg} proposal={msg.proposal} />
        </div>
      </div>
    )
  }
  if (msg.role === 'tool') {
    return (
      <div className="chat-message tool">
        <div className="chat-role">
          <span>ツール</span>
        </div>
        <div className="chat-content">
          <div className="chat-code-block agent-step-block agent-step-done">
            <div className="chat-code-header static">
              <span className="chat-code-label">{msg.toolName || 'ツール'}</span>
            </div>
            <pre className="chat-code-body">{msg.content}</pre>
          </div>
        </div>
      </div>
    )
  }
  const roleLabel = msg.role === 'user' ? 'あなた' : 'AI'
  return (
    <div className={`chat-message ${msg.role}`}>
      <div className="chat-role">
        <span>{roleLabel}</span>
        {msg.role === 'assistant' && modeLabel(requestMode) ? (
          <span className={`chat-message-mode ${requestMode}`}>{modeLabel(requestMode)}</span>
        ) : null}
      </div>
      <div className="chat-content">
        <p className="chat-text">
          {msg.content || (isStreaming ? '' : '…')}
          {isStreaming ? <span className="chat-streaming-cursor" aria-hidden /> : null}
        </p>
      </div>
    </div>
  )
}

function ProposalCard({ msg, proposal }: { msg: ChatMessage; proposal: ProposedEdit }): React.JSX.Element {
  const { before, after } = previewTexts(proposal)
  const lines = diffLines(before, after)
  const status = msg.proposalStatus ?? 'pending'
  const meta =
    (proposal.mode === 'replace_all' ? 'ファイル全体' : '範囲') +
    (status === 'applied' ? ' · 適用済み' : status === 'rejected' ? ' · 拒否' : status === 'conflict' ? ' · 衝突' : '')
  return (
    <div className={`chat-code-block actions${status === 'pending' || status === 'conflict' ? '' : ' is-settled'}`}>
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

