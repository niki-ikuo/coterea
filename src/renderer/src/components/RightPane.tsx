import { useState } from 'react'
import { useAppStore } from '../store'
import { setCollabPaneVisible } from '../lib/actions'
import { joinManual, leaveManualSession, startManualHost } from '../lib/collab'

export function RightPane(): React.JSX.Element {
  const displayName = useAppStore((s) => s.displayName)
  const collab = useAppStore((s) => s.collab)
  const connected = collab.status === 'hosting' || collab.status === 'joined'
  const participants = connected
    ? collab.peers
    : collab.peers.filter((peer) => peer.id === collab.localPeerId)
  const count = Math.max(participants.length, 1)
  const [endpoint, setEndpoint] = useState('')
  const [joining, setJoining] = useState(false)
  const endpoints =
    collab.status === 'hosting' && collab.tcpPort > 0
      ? collab.listenAddresses.map((ip) => `${ip}:${collab.tcpPort}`)
      : []

  const onJoin = async (): Promise<void> => {
    setJoining(true)
    try {
      await joinManual(endpoint)
    } finally {
      setJoining(false)
    }
  }

  return (
    <aside className="right-pane">
      <header className="pane-header">
        <div>
          <div className="pane-kicker">共同編集</div>
          <h2>セッション</h2>
        </div>
        <button type="button" className="pane-hide" onClick={() => void setCollabPaneVisible(false)}>
          非表示
        </button>
      </header>

      <section className="pane-card">
        <div className="label">自分の表示名</div>
        <button className="name-btn" type="button" onClick={() => void window.coterea.app.showSettings()}>
          <span className="swatch" style={{ background: collab.localColor }} />
          {displayName || '未設定'}
        </button>
      </section>

      <section className="pane-card">
        <div className="label">状態</div>
        <p className="status-line">
          {collab.status === 'solo' &&
            (collab.udpPeerCount > 0
              ? 'LAN上の相手を検出。接続を準備しています'
              : '一人で編集中（共同編集サーバーは起動していません）')}
          {collab.status === 'connecting' && '接続中…'}
          {collab.status === 'hosting' && `ハブ（先にいた人）· ${count}人`}
          {collab.status === 'joined' && `参加中 · ${count}人`}
          {collab.status === 'error' && (collab.error ?? 'エラー')}
        </p>
        {collab.netHint && <p className={collab.error ? 'error' : 'warn'}>{collab.netHint}</p>}
        {endpoints.length > 0 && (
          <div className="listen-list">
            <div className="label">待ち受け（手動接続用）</div>
            {endpoints.map((item) => (
              <div className="invite" key={item}>
                <code>{item}</code>
                <button
                  type="button"
                  onClick={() => void window.coterea.app.writeClipboard(item)}
                >
                  コピー
                </button>
              </div>
            ))}
          </div>
        )}
        {(collab.status === 'solo' || collab.status === 'connecting' || collab.status === 'error') && (
          <div className="join-form">
            <label>
              IP:ポートで接続
              <input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="192.168.1.10:51234"
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onJoin()
                }}
              />
            </label>
            <div className="join-actions">
              <button type="button" className="primary" disabled={joining} onClick={() => void onJoin()}>
                接続
              </button>
              <button type="button" disabled={joining} onClick={() => void startManualHost()}>
                ハブとして待つ
              </button>
            </div>
          </div>
        )}
        {(collab.status === 'hosting' || collab.status === 'joined') && (
          <div className="join-actions">
            <button type="button" onClick={() => void leaveManualSession()}>
              {collab.status === 'hosting' ? 'ハブを停止' : '切断'}
            </button>
          </div>
        )}
      </section>

      <section className="pane-card">
        <div className="label">共有中のファイル</div>
        {collab.sharedKeys.length === 0 ? (
          <p className="muted">
            {collab.identityHint ??
              '同じ実体のファイルを開くと、そのファイルだけ同期します。パス表記が違っても同一ファイルなら共有します。'}
          </p>
        ) : (
          <ul className="peer-list">
            {collab.sharedKeys.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
        )}
        {collab.identityHint && collab.sharedKeys.length === 0 && collab.remoteFileTitles.length > 0 && (
          <p className="muted small">相手が開いている名前: {collab.remoteFileTitles.join('、')}</p>
        )}
      </section>

      <section className="pane-card grow">
        <div className="label">参加者</div>
        <ul className="peer-list">
          {participants.length === 0 && <li className="muted">まだ誰もいません</li>}
          {participants.map((peer) => (
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
          同一LANのCotereaは自動でつながります。UDP が届かないときは、ハブ側の IP:ポートをコピーして手動接続してください。同期は同じ実体のファイルだけです。
        </p>
      </div>
    </aside>
  )
}
