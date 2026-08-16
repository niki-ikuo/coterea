import { PresenceBadge } from './PresenceBadge'
import appIcon from '../assets/icon.svg'

const MENUS = ['ファイル', '編集', '表示', 'ヘルプ'] as const

function popupMenu(label: string, el: HTMLElement): void {
  const rect = el.getBoundingClientRect()
  window.coterea.app.popupMenu(label, Math.round(rect.left), Math.round(rect.bottom))
}

export function TitleBar(): React.JSX.Element {
  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <img className="logo-mark" src={appIcon} alt="Coterea" width={18} height={18} />
        <nav className="app-menu" aria-label="アプリケーション">
          {MENUS.map((label) => (
            <button
              key={label}
              type="button"
              className="app-menu-item"
              onClick={(e) => popupMenu(label, e.currentTarget)}
              onContextMenu={(e) => {
                e.preventDefault()
                popupMenu(label, e.currentTarget)
              }}
            >
              {label}
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
