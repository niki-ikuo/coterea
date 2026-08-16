import { closeTab } from '../lib/actions'
import { useAppStore } from '../store'

export function TabBar(): React.JSX.Element {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const setActiveTabId = useAppStore((s) => s.setActiveTabId)

  return (
    <div className="tabbar">
      {tabs.length === 0 && <div className="tab tab-empty">ファイルを開くか、新規作成してください</div>}
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={tab.id === activeTabId ? 'tab active' : 'tab'}
          onClick={() => setActiveTabId(tab.id)}
          type="button"
        >
          <span className="tab-title">
            {tab.isDirty ? '● ' : ''}
            {tab.title}
          </span>
          <span
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation()
              void closeTab(tab.id)
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void closeTab(tab.id)
            }}
          >
            ×
          </span>
        </button>
      ))}
    </div>
  )
}
