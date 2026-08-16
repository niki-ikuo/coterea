import { useState } from 'react'
import { useAppStore } from '../store'

export function RightPane(): React.JSX.Element {
  const displayName = useAppStore((s) => s.displayName)
  const collab = useAppStore((s) => s.collab)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const count = Math.max(collab.peers.length, 1)

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
          {collab.status === 'solo' &&
            (collab.peers.length > 1 ? 'LAN上の相手を検出。接続を準備しています' : '一人で編集中（共同編集サーバーは起動していません）')}
          {collab.status === 'connecting' && '接続中…'}
          {collab.status === 'hosting' && `ハブ（先にいた人）· ${count}人`}
          {collab.status === 'joined' && `参加中 · ${count}人`}
          {collab.status === 'error' && (collab.error ?? 'エラー')}
        </p>
        {collab.status !== 'error' && collab.error && <p className="error">{collab.error}</p>}
      </section>

      <section className="pane-card">
        <div className="label">共有中のファイル</div>
        {collab.sharedKeys.length === 0 ? (
          <p className="muted">同じ実体のファイルを開くと、そのファイルだけ同期します。パス表記が違っても同一ファイルなら共有します。</p>
        ) : (
          <ul className="peer-list">
            {collab.sharedKeys.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
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
        <p className="hint">
          同一LANのCotereaは自動でつながります。ハブは先にいた人です。切れたら残りの最古参が引き継ぎます。同期は同じファイル名のタブだけです（無題は共有しません）。
        </p>
      </div>
    </aside>
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
            void window.coterea.collab.setDisplayName(s.displayName)
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
