import { useEffect, useRef, useState } from 'react'
import { editorsOnActiveFile } from '../lib/collab'
import { useAppStore } from '../store'
import type { PeerInfo } from '../../../shared/types'

function initials(name: string): string {
  const trimmed = name.replace(/（自分）/g, '').trim()
  const chars = [...trimmed]
  if (chars.length === 0) return '?'
  return chars[0]!.toUpperCase()
}

export function PresenceBadge(): React.JSX.Element | null {
  useAppStore((s) => s.activeTabId)
  useAppStore((s) => s.displayName)
  useAppStore((s) => s.collab.localColor)
  useAppStore((s) => s.collab.localPeerId)
  useAppStore((s) => s.collab.peers)
  const localPeerId = useAppStore((s) => s.collab.localPeerId)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const editors = editorsOnActiveFile()
  const shown = editors.slice(0, 3)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [])

  if (editors.length <= 1) return null

  return (
    <div className="presence" ref={wrapRef}>
      <button
        type="button"
        className="presence-btn"
        title="このファイルを編集中の人"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="presence-stack">
          {shown.map((peer) => (
            <span
              key={peer.id}
              className="presence-avatar"
              style={{ background: peer.color }}
              title={peer.displayName}
            >
              {initials(peer.displayName)}
            </span>
          ))}
        </span>
        <span className="presence-count">{editors.length}人</span>
      </button>
      {open && (
        <div className="presence-pop" role="dialog" aria-label="このファイルを編集中">
          <div className="presence-pop-title">このファイルを編集中 · {editors.length}人</div>
          <ul className="presence-pop-list">
            {editors.map((peer) => (
              <PresenceRow
                key={peer.id}
                peer={peer}
                mine={peer.id === localPeerId || peer.id === 'local'}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function PresenceRow({ peer, mine }: { peer: PeerInfo; mine: boolean }): React.JSX.Element {
  return (
            <li>
      <span className="presence-avatar lg" style={{ background: peer.color }}>
        {initials(peer.displayName)}
      </span>
      <span>
        {peer.displayName}
        {mine ? '（自分）' : ''}
      </span>
    </li>
  )
}
