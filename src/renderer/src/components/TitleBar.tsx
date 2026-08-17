import { useEffect, useRef } from 'react'
import { PresenceBadge } from './PresenceBadge'
import { APP_MENUS } from '../../../shared/appMenus'
import appIcon from '../assets/icon.svg'

function popupMenu(label: string, el: HTMLElement): void {
  const rect = el.getBoundingClientRect()
  window.coterea.app.popupMenu(label, Math.round(rect.left), Math.round(rect.bottom))
}

export function TitleBar(): React.JSX.Element {
  const buttons = useRef<Array<HTMLButtonElement | null>>([])

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
      </div>
    </header>
  )
}
