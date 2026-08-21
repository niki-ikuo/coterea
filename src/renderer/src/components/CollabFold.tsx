import { useEffect, useRef, useState } from 'react'
import { isFileTab, useAppStore } from '../store'
import { openSettingsTab } from '../lib/actions'
import { joinManual, leaveManualSession, startManualHost } from '../lib/collab'
import { COLLAB_LAN_NOTICE_SHORT } from '../../../shared/collabNotice'
import { fileIdsOf } from '../../../shared/fileSession'

export function CollabFold(): React.JSX.Element {
  const displayName = useAppStore((s) => s.displayName)
  const collab = useAppStore((s) => s.collab)
  const tabs = useAppStore((s) => s.tabs)
  const connected = collab.status === 'hosting' || collab.status === 'joined'
  const participants = connected
    ? collab.peers
    : collab.peers.filter((peer) => peer.id === collab.localPeerId)
  const count = Math.max(participants.length, 1)
  const localTitles = tabs
    .filter((tab) => isFileTab(tab) && fileIdsOf(tab).length > 0)
    .map((tab) => tab.title)
  const notSyncing = connected && collab.sharedKeys.length === 0
  const [endpoint, setEndpoint] = useState('')
  const [joining, setJoining] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    }
  }, [])

  const onCopyEndpoint = async (item: string): Promise<void> => {
    await window.coterea.app.writeClipboard(item)
    setCopied(item)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopied(null), 1500)
  }
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
    <div className="collab-fold">
      <section className="pane-card">
        <div className="label">自分の表示名</div>
        <button className="name-btn" type="button" onClick={() => openSettingsTab('general')}>
          <span className="swatch" style={{ background: collab.localColor }} />
          {displayName || '未設定'}
        </button>
      </section>

      <section className="pane-card">
        <div className="label">状態</div>
        <p className="status-line">
          {collab.status === 'solo' &&
            (collab.udpPeerCount > 0
              ? collab.netHint && !collab.netHint.includes('待っています')
                ? '相手を検出したが未接続'
                : 'LAN上の相手を検出。接続を準備しています'
              : '一人で編集中（共同編集サーバーは起動していません）')}
          {collab.status === 'connecting' && '接続中…'}
          {collab.status === 'hosting' &&
            (notSyncing
              ? `ハブ（先にいた人）· ${count}人 · ファイル未同期`
              : `ハブ（先にいた人）· ${count}人`)}
          {collab.status === 'joined' &&
            (notSyncing ? `参加中 · ${count}人 · ファイル未同期` : `参加中 · ${count}人`)}
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
                  className={copied === item ? 'is-copied' : undefined}
                  onClick={() => void onCopyEndpoint(item)}
                >
                  {copied === item ? 'コピー済み' : 'コピー'}
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

      <section className={`pane-card${notSyncing ? ' is-sync-warn' : ''}`}>
        <div className="label">{notSyncing ? 'ファイル同期（未共有）' : '共有中のファイル'}</div>
        {notSyncing ? (
          <>
            <p className="warn">
              {collab.identityHint ??
                '接続できていても、同じ実体のファイルを双方が開くまで編集は同期しません。'}
            </p>
            <div className="sync-sides">
              <div>
                <div className="label">こちら</div>
                {localTitles.length === 0 ? (
                  <p className="muted small">保存済みファイルなし（無題は同期しません）</p>
                ) : (
                  <ul className="peer-list compact">
                    {localTitles.map((title) => (
                      <li key={`local-${title}`}>{title}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="label">相手</div>
                {collab.remoteFileTitles.length === 0 ? (
                  <p className="muted small">共有できるファイルなし</p>
                ) : (
                  <ul className="peer-list compact">
                    {collab.remoteFileTitles.map((title) => (
                      <li key={`remote-${title}`}>{title}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <p className="muted small">
              同名のローカルコピー同士では同期しません。SMB などネットワーク共有上の同じファイルを双方で開いてください。
            </p>
          </>
        ) : collab.sharedKeys.length === 0 ? (
          <p className="muted">
            {collab.identityHint ??
              '同じ実体のファイルを開くと、そのファイルだけ同期します。パス表記が違っても同一ファイルなら共有します。'}
          </p>
        ) : (
          <ul className="peer-list">
            {(collab.fileSavers.length > 0
              ? collab.fileSavers
              : collab.sharedKeys.map((title) => ({ title, local: true, name: 'このPC' }))
            ).map((item) => (
              <li key={item.title}>
                {item.title}
                <div className="muted small">ディスク保存: {item.local ? 'このPC' : item.name}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pane-card">
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

      <p className="hint warn">{COLLAB_LAN_NOTICE_SHORT}</p>
      <button type="button" className="linkish" onClick={() => void window.coterea.app.showCollabNotice()}>
        共同編集について
      </button>
    </div>
  )
}
