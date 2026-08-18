import { useEffect, useRef, useState } from 'react'
import { setCollabPaneVisible, openSettingsTab } from '../lib/actions'
import {
  applyAllPending,
  applyProposal,
  closeThread,
  newThread,
  rejectProposal,
  renameThread,
  selectThread,
  sendChat,
  setDraft,
  setThreadMode,
  stopChat
} from '../lib/chat'
import { useAppStore } from '../store'
import { diffLines, previewTexts } from '../../../shared/lineDiff'
import type { ChatMessage, ChatMode, ProposedEdit } from '../../../shared/ai'

const MODES: { id: ChatMode; label: string }[] = [
  { id: 'ask', label: 'Ask' },
  { id: 'edit', label: 'Edit' },
  { id: 'agent', label: 'Agent' }
]

export function RightPane(): React.JSX.Element {
  const chat = useAppStore((s) => s.chat)
  const busy = useAppStore((s) => s.chatBusy)
  const configured = useAppStore((s) => s.aiConfigured)
  const [renaming, setRenaming] = useState<string | null>(null)
  const thread = chat.threads.find((t) => t.id === chat.activeId) ?? chat.threads[0]
  const pending = thread?.messages.filter((m) => m.proposal && m.proposalStatus === 'pending') ?? []

  return (
    <aside className="right-pane chat-pane">
      <header className="pane-header chat-header">
        <div className="pane-kicker">会話</div>
        <button type="button" className="pane-hide" onClick={() => void setCollabPaneVisible(false)}>
          非表示
        </button>
      </header>

      {thread && (
        <div className="chat-tabbar" role="tablist">
          <div className="chat-tabbar-scroll">
            {chat.threads.map((item) => {
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
          <button className="tab-add" type="button" title="新しい会話" aria-label="新しい会話" onClick={() => newThread()}>
            +
          </button>
        </div>
      )}

      <ChatLog messages={thread?.messages ?? []} />

      {pending.length > 1 && (
        <div className="chat-batch">
          <button type="button" className="primary" onClick={() => void applyAllPending(false)}>
            一括適用（{pending.length}）
          </button>
        </div>
      )}

      {thread && (
        <div className="chat-composer">
          <div className="md-seg chat-modes" role="group" aria-label="モード">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={thread.mode === mode.id ? 'on' : ''}
                onClick={() => setThreadMode(mode.id)}
                disabled={busy}
              >
                {mode.label}
              </button>
            ))}
          </div>
          {!configured && (
            <p className="muted small">
              API が未設定です。
              <button type="button" className="linkish" onClick={() => openSettingsTab('ai')}>
                設定を開く
              </button>
            </p>
          )}
          <textarea
            value={thread.draft ?? ''}
            placeholder={
              thread.mode === 'ask'
                ? '質問する（Enter で送信）'
                : thread.mode === 'edit'
                  ? '文書への変更を依頼'
                  : '複数ファイルをまたいで依頼'
            }
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
          <div className="chat-send-row">
            {busy ? (
              <button type="button" onClick={() => void stopChat()}>
                停止
              </button>
            ) : (
              <button type="button" className="primary" onClick={() => void sendChat()} disabled={!configured}>
                送信
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}

function ChatLog({ messages }: { messages: ChatMessage[] }): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])
  return (
    <div className="chat-log" ref={scroller}>
      {messages.length === 0 && <p className="muted">このスレッドの履歴はまだありません。</p>}
      {messages.map((msg) => (
        <ChatBubble key={msg.id} msg={msg} />
      ))}
    </div>
  )
}

function ChatBubble({ msg }: { msg: ChatMessage }): React.JSX.Element {
  if (msg.proposal) return <ProposalCard msg={msg} proposal={msg.proposal} />
  if (msg.role === 'tool') {
    return (
      <div className="chat-msg tool">
        <div className="chat-role">ツール</div>
        <div>{msg.content}</div>
      </div>
    )
  }
  return (
    <div className={`chat-msg ${msg.role}`}>
      <div className="chat-role">{msg.role === 'user' ? 'あなた' : 'AI'}</div>
      <div className="chat-text">{msg.content || '…'}</div>
    </div>
  )
}

function ProposalCard({ msg, proposal }: { msg: ChatMessage; proposal: ProposedEdit }): React.JSX.Element {
  const { before, after } = previewTexts(proposal)
  const lines = diffLines(before, after)
  const status = msg.proposalStatus ?? 'pending'
  return (
    <div className="diff-card">
      <div className="diff-head">
        <strong>{proposal.tabTitle || proposal.tabId}</strong>
        <span className="muted small">
          {proposal.mode === 'replace_all' ? 'ファイル全体' : '範囲'}
          {status === 'applied' ? ' · 適用済み' : status === 'rejected' ? ' · 拒否' : status === 'conflict' ? ' · 衝突' : ''}
        </span>
      </div>
      {proposal.note && <p className="muted small">{proposal.note}</p>}
      <pre className="diff-body">
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

