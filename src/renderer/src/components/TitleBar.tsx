import { useEffect, useRef } from 'react'
import { PresenceBadge } from './PresenceBadge'
import { APP_MENUS } from '../../../shared/appMenus'
import { openSettingsTab, toggleCollabPane } from '../lib/actions'
import { useAppStore } from '../store'
import appIcon from '../assets/icon.svg'

function popupMenu(label: string, el: HTMLElement): void {
  const rect = el.getBoundingClientRect()
  window.coterea.app.popupMenu(label, Math.round(rect.left), Math.round(rect.bottom))
}

export function TitleBar(): React.JSX.Element {
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const aiPaneOpen = useAppStore((s) => s.collabPaneVisible)

  const openAt = (index: number): void => {
    const el = buttons.current[index]
    const item = APP_MENUS[index]
    if (el && item) popupMenu(item.label, el)
  }

  const focusAt = (index: number): void => {
    const i = (index + APP_MENUS.length) % APP_MENUS.length
    buttons.current[i]?.focus()
  }

  useEffect(() => {
    return window.coterea.app.onMenu(({ action, extra }) => {
      if (action === 'focus-app-menu') {
        buttons.current[0]?.focus()
      }
      if (action === 'popup-app-menu' && extra) {
        const index = APP_MENUS.findIndex((item) => item.label === extra)
        if (index >= 0) openAt(index)
      }
    })
  }, [])

  return (
    <div className="titlebar-row">
      <header className="titlebar">
      <div className="titlebar-left">
        <img className="logo-mark" src={appIcon} alt="Coterea" width={18} height={18} />
        <nav className="app-menu" aria-label="アプリケーション">
          {APP_MENUS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className="app-menu-item"
              ref={(el) => {
                buttons.current[index] = el
              }}
              aria-keyshortcuts={`Alt+${item.key}`}
              onClick={(e) => popupMenu(item.label, e.currentTarget)}
              onContextMenu={(e) => {
                e.preventDefault()
                popupMenu(item.label, e.currentTarget)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault()
                  focusAt(index + 1)
                }
                if (e.key === 'ArrowLeft') {
                  e.preventDefault()
                  focusAt(index - 1)
                }
                if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openAt(index)
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  e.currentTarget.blur()
                }
              }}
            >
              {item.label}({item.key})
            </button>
          ))}
        </nav>
      </div>
      <div className="titlebar-right">
        <PresenceBadge />
        <button
          type="button"
          className="titlebar-icon-btn"
          title="設定"
          aria-label="設定"
          onClick={() => openSettingsTab()}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden>
            <path
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinejoin="round"
              d="M6.55 2h2.9l.28 1.38c.38.12.73.3 1.05.52l1.32-.55 1.45 1.45-.55 1.32c.22.32.4.67.52 1.05L14 6.55v2.9l-1.38.28c-.12.38-.3.73-.52 1.05l.55 1.32-1.45 1.45-1.32-.55a4.7 4.7 0 0 1-1.05.52L9.45 14h-2.9l-.28-1.38a4.7 4.7 0 0 1-1.05-.52l-1.32.55-1.45-1.45.55-1.32a4.7 4.7 0 0 1-.52-1.05L2 9.45v-2.9l1.38-.28c.12-.38.3-.73.52-1.05l-.55-1.32 1.45-1.45 1.32.55c.32-.22.67-.4 1.05-.52L6.55 2z"
            />
            <circle cx="8" cy="8" r="2.15" stroke="currentColor" strokeWidth="1.25" />
          </svg>
        </button>
        <button
          type="button"
          className="titlebar-icon-btn"
          title={aiPaneOpen ? 'AIパネルを隠す' : 'AIパネルを表示'}
          aria-label={aiPaneOpen ? 'AIパネルを隠す' : 'AIパネルを表示'}
          aria-pressed={aiPaneOpen}
          onClick={() => void toggleCollabPane()}
        >
          {aiPaneOpen ? (
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
              <rect
                x="2.25"
                y="2.25"
                width="11.5"
                height="11.5"
                rx="1.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
              />
              <path fill="currentColor" d="M10 2.25h2.25A1.5 1.5 0 0 1 13.75 3.75v8.5a1.5 1.5 0 0 1-1.5 1.5H10V2.25z" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden>
              <rect
                x="2.25"
                y="2.25"
                width="11.5"
                height="11.5"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.25"
              />
              <path d="M10 2.25v11.5" stroke="currentColor" strokeWidth="1.25" />
            </svg>
          )}
        </button>
      </div>
      </header>
    </div>
  )
}
