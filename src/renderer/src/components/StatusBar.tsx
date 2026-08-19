import { useEffect, useRef, useState } from 'react'
import { encodingLabel, ENCODINGS, type EncodingId } from '../../../shared/encoding'
import { reopenWithEncoding, setTabEncoding, cycleMdView } from '../lib/actions'
import { isMarkdownLanguage, languageLabel } from '../lib/fileMeta'
import { isVirtualTab, useAppStore } from '../store'
import { formatTokenCountCompact } from '../../../shared/llmUsage'
import { CollabFold } from './CollabFold'

export function StatusBar(): React.JSX.Element {
  const line = useAppStore((s) => s.line)
  const column = useAppStore((s) => s.column)
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const aiConfigured = useAppStore((s) => s.aiConfigured)
  const chatBusy = useAppStore((s) => s.chatBusy)
  const aiUsage = useAppStore((s) => s.aiUsage)
  const tab = tabs.find((t) => t.id === activeTabId)

  const aiLabel = chatBusy ? '生成中' : aiConfigured ? '接続可' : '未設定'
  const usageHint =
    aiUsage.requestCount > 0 || aiUsage.totalTokens > 0
      ? `LLM リクエスト ${aiUsage.requestCount} 回 / トークン ${formatTokenCountCompact(aiUsage.totalTokens)}`
      : undefined
  const aiText =
    aiUsage.requestCount > 0 || aiUsage.totalTokens > 0
      ? `AI: ${aiLabel} · ${aiUsage.requestCount}回 · ${formatTokenCountCompact(aiUsage.totalTokens)} tok`
      : `AI: ${aiLabel}`

  return (
    <footer className="statusbar">
      <span>
        行 {line} : 列 {column}
      </span>
      {tab && isVirtualTab(tab) ? (
        <span>{tab.title}</span>
      ) : (
        <>
          <span>{languageLabel(tab?.language ?? 'plaintext')}</span>
          {tab && isMarkdownLanguage(tab.language) && (
            <button type="button" className="status-btn" onClick={() => cycleMdView(tab.id)}>
              {tab.mdView === 'edit' ? 'MD 編集' : tab.mdView === 'split' ? 'MD 分割' : 'MD プレビュー'}
            </button>
          )}
          {tab ? <EncodingPicker tabId={tab.id} encoding={tab.encoding} hasPath={Boolean(tab.path)} /> : <span>UTF-8</span>}
        </>
      )}
      <CollabPicker />
      {tab?.saveError ? (
        <span className="error" title={tab.saveError}>
          保存失敗
        </span>
      ) : null}
      <span title={usageHint}>{aiText}</span>
    </footer>
  )
}

function CollabPicker(): React.JSX.Element {
  const collab = useAppStore((s) => s.collab)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const connected = collab.status === 'hosting' || collab.status === 'joined'
  const n = connected ? Math.max(collab.peers.length, 1) : 0
  const failed =
    collab.status === 'error' ||
    (Boolean(collab.error) && collab.status !== 'hosting' && collab.status !== 'joined' && collab.status !== 'connecting')
  const label = connected
    ? `接続 ${n}人`
    : collab.status === 'connecting'
      ? '接続中'
      : failed
        ? '接続失敗'
        : collab.udpPeerCount > 0
          ? '検出中'
          : 'なし'
  const showHint = Boolean(collab.netHint) && (failed || collab.status === 'connecting')

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
    <div className="collab-picker" ref={wrapRef}>
      <button
        type="button"
        className={`status-btn${failed ? ' is-error' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={collab.netHint ?? '共同編集'}
        onClick={() => setOpen((v) => !v)}
      >
        共同編集: {label}
      </button>
      {showHint && collab.netHint ? (
        <span className="status-hint" title={collab.netHint}>
          {collab.netHint}
        </span>
      ) : null}
      {open && (
        <div className="collab-pop" role="dialog" aria-label="共同編集">
          <CollabFold />
        </div>
      )}
    </div>
  )
}

function EncodingPicker({
  tabId,
  encoding,
  hasPath
}: {
  tabId: string
  encoding: EncodingId
  hasPath: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [])

  const choose = (id: EncodingId, reopen: boolean): void => {
    setOpen(false)
    if (reopen) void reopenWithEncoding(tabId, id)
    else setTabEncoding(tabId, id)
  }

  return (
    <div className="encoding-picker" ref={wrapRef}>
      <button type="button" className="status-btn" onClick={() => setOpen((v) => !v)}>
        {encodingLabel(encoding)}
      </button>
      {open && (
        <div className="encoding-menu">
          <div className="encoding-hint">保存時の文字コード</div>
          {ENCODINGS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === encoding ? 'active' : ''}
              onClick={() => choose(item.id, false)}
            >
              {item.label}
            </button>
          ))}
          {hasPath && (
            <>
              <div className="encoding-hint">ディスクから開き直す</div>
              {ENCODINGS.map((item) => (
                <button key={`reopen-${item.id}`} type="button" onClick={() => choose(item.id, true)}>
                  {item.label} で開き直す
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
