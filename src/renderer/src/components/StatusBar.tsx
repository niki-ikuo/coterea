import { useEffect, useRef, useState } from 'react'
import { encodingLabel, ENCODINGS, type EncodingId } from '../../../shared/encoding'
import { reopenWithEncoding, setTabEncoding, cycleMdView } from '../lib/actions'
import { isMarkdownLanguage, languageLabel } from '../lib/monacoEnv'
import { useAppStore } from '../store'

export function StatusBar(): React.JSX.Element {
  const line = useAppStore((s) => s.line)
  const column = useAppStore((s) => s.column)
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const collab = useAppStore((s) => s.collab)
  const tab = tabs.find((t) => t.id === activeTabId)
  const connected = collab.status === 'hosting' || collab.status === 'joined'
  const n = connected ? Math.max(collab.peers.length, 1) : 0
  const collabLabel = connected
    ? `接続 ${n}人`
    : collab.status === 'connecting'
      ? '接続中'
      : collab.error
        ? '接続失敗'
        : collab.udpPeerCount > 0
          ? '検出中'
          : '一人'

  return (
    <footer className="statusbar">
      <span>
        行 {line} : 列 {column}
      </span>
      <span>{languageLabel(tab?.language ?? 'plaintext')}</span>
      {tab && isMarkdownLanguage(tab.language) && (
        <button type="button" className="status-btn" onClick={() => cycleMdView(tab.id)}>
          {tab.mdView === 'edit' ? 'MD 編集' : tab.mdView === 'split' ? 'MD 分割' : 'MD プレビュー'}
        </button>
      )}
      {tab ? <EncodingPicker tabId={tab.id} encoding={tab.encoding} hasPath={Boolean(tab.path)} /> : <span>UTF-8</span>}
      <span title={collab.netHint ?? undefined}>共同編集: {collabLabel}</span>
      {tab?.saveError ? (
        <span className="error" title={tab.saveError}>
          保存失敗
        </span>
      ) : null}
      <span>AI: 未設定</span>
    </footer>
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
