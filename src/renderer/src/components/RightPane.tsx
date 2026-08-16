import { useState } from 'react'
import { joinCollab, leaveCollab, startCollab } from '../lib/collab'
import { useAppStore } from '../store'

export function RightPane(): React.JSX.Element {
  const displayName = useAppStore((s) => s.displayName)
  const collab = useAppStore((s) => s.collab)
  const setJoinOpen = useAppStore((s) => s.setJoinOpen)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const [busy, setBusy] = useState(false)

  const connected = collab.status === 'hosting' || collab.status === 'joined'
  const count = Math.max(collab.peers.length, connected ? 1 : 0)

  return (
    <aside className="right-pane">
      <header className="pane-header">
        <div>
          <div className="pane-kicker">共同編集</div>
          <h2>セッション</h2>
        </div>
      </header>

      <section className="pane-card">
        <div className="label">自分の表示名</div>
        <button className="name-btn" type="button" onClick={() => setSettingsOpen(true)}>
          <span className="swatch" style={{ background: collab.localColor }} />
          {displayName || '未設定'}
        </button>
      </section>

      <section className="pane-card">
        <div className="label">状態</div>
        <p className="status-line">
          {collab.status === 'idle' && '未接続（共同編集は開始するまでオフ）'}
          {collab.status === 'connecting' && '参加中…'}
          {collab.status === 'hosting' && `ホスト中 · ${count}人`}
          {collab.status === 'joined' && `参加中 · ${count}人`}
          {collab.status === 'error' && (collab.error ?? 'エラー')}
        </p>
        {collab.status !== 'error' && collab.error && <p className="error">{collab.error}</p>}
        {collab.sessionName && <p className="muted">{collab.sessionName}</p>}
        {collab.roomId && (
          <div className="invite">
            <div className="label">招待コード</div>
            <code>{collab.roomId}</code>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(collab.roomId ?? '')}
            >
              コピー
            </button>
          </div>
        )}
      </section>

      <section className="pane-card grow">
        <div className="label">参加者</div>
        <ul className="peer-list">
          {collab.peers.length === 0 && <li className="muted">まだ誰もいません</li>}
          {collab.peers.map((peer) => (
            <li key={peer.id}>
              <span className="swatch" style={{ background: peer.color }} />
              <div>
                <div>
                  {peer.displayName}
                  {peer.id === collab.localPeerId ? '（自分）' : ''}
                </div>
                <div className="muted small">{peer.docTitle ?? '—'}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="pane-actions">
        {!connected && (
          <>
            <button
              className="primary"
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void startCollab().finally(() => setBusy(false))
              }}
            >
              共同編集を開始
            </button>
            <button type="button" onClick={() => setJoinOpen(true)}>
              招待コードで参加
            </button>
          </>
        )}
        {connected && (
          <button type="button" onClick={() => void leaveCollab()}>
            離脱
          </button>
        )}
        <p className="hint">
          同一LAN向けです。Cotereaのサーバーは使いません。フェーズ1ではホストが切れるとセッションが終了します。
        </p>
      </div>
    </aside>
  )
}

export function JoinModal(): React.JSX.Element | null {
  const open = useAppStore((s) => s.joinOpen)
  const setJoinOpen = useAppStore((s) => s.setJoinOpen)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const error = useAppStore((s) => s.collab.error)
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={() => setJoinOpen(false)}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          setBusy(true)
          void joinCollab(code).finally(() => {
            setBusy(false)
            if (useAppStore.getState().collab.status === 'joined') setJoinOpen(false)
          })
        }}
      >
        <h3>セッションに参加</h3>
        <p className="muted">同一LANの招待コードを入力してください。</p>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="例: 7K3MPL"
          maxLength={8}
        />
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={() => setJoinOpen(false)}>
            キャンセル
          </button>
          <button className="primary" type="submit" disabled={busy || code.trim().length < 4}>
            参加
          </button>
        </div>
      </form>
    </div>
  )
}

export function SettingsModal(): React.JSX.Element | null {
  const open = useAppStore((s) => s.settingsOpen)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const displayName = useAppStore((s) => s.displayName)
  const [name, setName] = useState(displayName)
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          const trimmed = name.trim()
          if (!trimmed) return
          void window.coterea.settings.set({ displayName: trimmed }).then((s) => {
            useAppStore.getState().setDisplayName(s.displayName)
            setSettingsOpen(false)
          })
        }}
      >
        <h3>設定</h3>
        <label>
          表示名
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={() => setSettingsOpen(false)}>
            キャンセル
          </button>
          <button className="primary" type="submit">
            保存
          </button>
        </div>
      </form>
    </div>
  )
}
