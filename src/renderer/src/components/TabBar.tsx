import { closeTab, createUntitled, setMdScrollSync, setMdView } from '../lib/actions'
import { isMarkdownLanguage } from '../lib/monacoEnv'
import { useAppStore, type MdView, type TabInfo } from '../store'

const MD_MODES: { id: MdView; label: string }[] = [
  { id: 'edit', label: '編集' },
  { id: 'split', label: '分割' },
  { id: 'preview', label: 'プレビュー' }
]

const GLYPH: Record<string, { mark: string; color: string }> = {
  markdown: { mark: 'MD', color: '#519aba' },
  typescript: { mark: 'TS', color: '#3178c6' },
  javascript: { mark: 'JS', color: '#cbcb41' },
  json: { mark: '{}', color: '#cb8f37' },
  html: { mark: '<>', color: '#e44d26' },
  css: { mark: '#', color: '#563d7c' },
  scss: { mark: '#', color: '#c6538c' },
  python: { mark: 'Py', color: '#3572a5' },
  go: { mark: 'Go', color: '#00add8' },
  rust: { mark: 'Rs', color: '#dea584' },
  java: { mark: 'Jv', color: '#b07219' },
  csharp: { mark: 'C#', color: '#178600' },
  c: { mark: 'C', color: '#555555' },
  cpp: { mark: 'C+', color: '#f34b7d' },
  ruby: { mark: 'Rb', color: '#701516' },
  php: { mark: 'php', color: '#4f5d95' },
  shell: { mark: '>_', color: '#89e051' },
  powershell: { mark: 'ps', color: '#012456' },
  bat: { mark: 'BAT', color: '#c1f12e' },
  vb: { mark: 'VB', color: '#945db7' },
  ini: { mark: 'i', color: '#6d8086' },
  less: { mark: '#', color: '#1d365d' },
  fsharp: { mark: 'F#', color: '#b845fc' },
  pascal: { mark: 'Pa', color: '#e3f171' },
  perl: { mark: 'Pl', color: '#0298c3' },
  kotlin: { mark: 'Kt', color: '#a97bff' },
  razor: { mark: '@', color: '#512bd4' },
  dockerfile: { mark: 'Dk', color: '#384d54' },
  yaml: { mark: 'Y', color: '#cb171e' },
  xml: { mark: 'xml', color: '#0060ac' },
  sql: { mark: 'Q', color: '#e38c00' },
  plaintext: { mark: 'Aa', color: '#8a8a8a' }
}

function glyphFor(language: string): { mark: string; color: string } {
  return GLYPH[language] ?? { mark: '·', color: '#8a8a8a' }
}

export function TabBar(): React.JSX.Element {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const setActiveTabId = useAppStore((s) => s.setActiveTabId)
  const active = tabs.find((t) => t.id === activeTabId)

  return (
    <>
      <div className="tabbar">
        <div className="tabbar-scroll" role="tablist">
          {tabs.length === 0 && <div className="tab tab-empty">ファイルを開くか、新規作成してください</div>}
          {tabs.map((tab) => {
            const glyph = glyphFor(tab.language)
            const selected = tab.id === activeTabId
            return (
              <div
                key={tab.id}
                className={`tab${selected ? ' active' : ''}${tab.isDirty ? ' is-dirty' : ''}`}
                role="tab"
                aria-selected={selected}
                tabIndex={0}
                onClick={() => setActiveTabId(tab.id)}
                onMouseDown={(e) => {
                  if (e.button === 1) e.preventDefault()
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault()
                    void closeTab(tab.id)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setActiveTabId(tab.id)
                  }
                }}
              >
                <span className="tab-icon" style={{ color: glyph.color }} aria-hidden>
                  {glyph.mark}
                </span>
                <span className="tab-title" title={tab.path ?? tab.title}>
                  {tab.title}
                </span>
                <button
                  className="tab-close"
                  type="button"
                  title={tab.isDirty ? '未保存 · 閉じる' : '閉じる'}
                  aria-label={`${tab.title} を閉じる`}
                  onClick={(e) => {
                    e.stopPropagation()
                    void closeTab(tab.id)
                  }}
                >
                  <span className="tab-close-x" aria-hidden>
                    <svg viewBox="0 0 16 16" width="10" height="10">
                      <path
                        fill="currentColor"
                        d="M8 8.707 11.646 12.354l.708-.708L8.707 8l3.647-3.646-.708-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708z"
                      />
                    </svg>
                  </span>
                  <span className="tab-close-dot" aria-hidden />
                </button>
              </div>
            )
          })}
        </div>
        <button
          className="tab-add"
          type="button"
          title="新しいタブ"
          aria-label="新しいタブ"
          onClick={() => createUntitled()}
        >
          +
        </button>
        <div
          className="tabbar-rest"
          onDoubleClick={() => createUntitled()}
          title="ダブルクリックで新しいタブ"
        />
      </div>
      {active && isMarkdownLanguage(active.language) && <MarkdownToolbar tab={active} />}
    </>
  )
}

function MarkdownToolbar({ tab }: { tab: TabInfo }): React.JSX.Element {
  return (
    <div className="md-toolbar">
      <span className="md-toolbar-label">Markdown</span>
      <div className="md-seg" role="group" aria-label="表示モード">
        {MD_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={tab.mdView === mode.id ? 'on' : ''}
            onClick={() => setMdView(tab.id, mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {tab.mdView === 'split' && (
        <label className="md-sync">
          <input
            type="checkbox"
            checked={tab.mdScrollSync}
            onChange={(e) => setMdScrollSync(tab.id, e.target.checked)}
          />
          章で同期
        </label>
      )}
    </div>
  )
}
