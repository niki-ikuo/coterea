import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  activateTabAt,
  closeAllTabs,
  closeOtherTabs,
  closeTab,
  createUntitled,
  cycleTab,
  reloadTabFromDisk,
  reorderTab,
  saveTab,
  setMdScrollSync,
  setMdView
} from '../lib/actions'
import { addFileTabToChat, copyFileTabChatRef } from '../lib/chat'
import { isMarkdownLanguage } from '../lib/fileMeta'
import { writeChatContextDrag } from '../../../shared/chatContext'
import {
  dropInsertIndex,
  dropSide,
  EDITOR_TAB_REORDER_MIME
} from '../../../shared/tabOrder'
import { scrollActiveTabIntoView } from '../lib/tabScroll'
import { isSettingsTab, useAppStore, type MdView, type TabInfo } from '../store'

const MD_MODES: { id: MdView; label: string }[] = [
  { id: 'edit', label: '編集' },
  { id: 'split', label: '分割' },
  { id: 'preview', label: '表示' }
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

function glyphFor(tab: TabInfo): { mark: string; color: string } {
  if (isSettingsTab(tab)) return { mark: '設', color: '#7c6f64' }
  return GLYPH[tab.language] ?? { mark: '·', color: '#8a8a8a' }
}

export function TabBar(): React.JSX.Element | null {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const setActiveTabId = useAppStore((s) => s.setActiveTabId)
  const active = tabs.find((t) => t.id === activeTabId)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; tabId: string } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<{ id: string; side: 'before' | 'after' } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const tabsKey = tabs.map((t) => t.id).join('|')

  useLayoutEffect(() => {
    if (!activeTabId || tabs.length === 0) return
    scrollActiveTabIntoView(scrollRef.current, '.tab.active')
  }, [activeTabId, tabsKey, tabs.length])

  if (tabs.length === 0) return null

  const clearDrag = (): void => {
    setDraggingId(null)
    setDropHint(null)
  }

  const acceptReorder = (fromId: string, overId: string, clientX: number, el: HTMLElement): void => {
    const from = tabs.findIndex((t) => t.id === fromId)
    const over = tabs.findIndex((t) => t.id === overId)
    if (from < 0 || over < 0 || fromId === overId) return
    const to = dropInsertIndex(from, over, clientX, el.getBoundingClientRect())
    if (to === from) return
    reorderTab(fromId, to)
  }

  return (
    <>
      <div className="tabbar">
        <div
          className="tabbar-scroll"
          role="tablist"
          ref={scrollRef}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return
            setDropHint(null)
          }}
        >
          {tabs.map((tab) => {
            const glyph = glyphFor(tab)
            const selected = tab.id === activeTabId
            const hint = dropHint?.id === tab.id ? dropHint.side : null
            return (
              <div
                key={tab.id}
                className={`tab${selected ? ' active' : ''}${tab.isDirty ? ' is-dirty' : ''}${
                  draggingId === tab.id ? ' is-dragging' : ''
                }${hint === 'before' ? ' drop-before' : ''}${hint === 'after' ? ' drop-after' : ''}`}
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                draggable
                onDragStart={(e) => {
                  setDraggingId(tab.id)
                  e.dataTransfer.setData(EDITOR_TAB_REORDER_MIME, tab.id)
                  e.dataTransfer.effectAllowed = 'copyMove'
                  if (!isSettingsTab(tab)) {
                    writeChatContextDrag(e.dataTransfer, {
                      kind: 'file',
                      tabId: tab.id,
                      title: tab.title,
                      path: tab.path,
                      language: tab.language
                    })
                  }
                  e.dataTransfer.setDragImage(
                    e.currentTarget,
                    Math.min(40, e.currentTarget.clientWidth / 2),
                    e.currentTarget.clientHeight / 2
                  )
                }}
                onDragEnd={clearDrag}
                onDragOver={(e) => {
                  if (![...e.dataTransfer.types].includes(EDITOR_TAB_REORDER_MIME)) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (draggingId === tab.id) {
                    setDropHint(null)
                    return
                  }
                  setDropHint({ id: tab.id, side: dropSide(e.clientX, e.currentTarget.getBoundingClientRect()) })
                }}
                onDrop={(e) => {
                  const fromId = e.dataTransfer.getData(EDITOR_TAB_REORDER_MIME)
                  if (!fromId) return
                  e.preventDefault()
                  e.stopPropagation()
                  acceptReorder(fromId, tab.id, e.clientX, e.currentTarget)
                  clearDrag()
                }}
                onClick={() => setActiveTabId(tab.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setCtxMenu({ x: e.clientX, y: e.clientY, tabId: tab.id })
                }}
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
                  const index = tabs.findIndex((t) => t.id === tab.id)
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setActiveTabId(tab.id)
                  }
                  if (e.key === 'ArrowRight') {
                    e.preventDefault()
                    cycleTab(1)
                    requestAnimationFrame(() => {
                      document.querySelector<HTMLElement>('.tab.active')?.focus()
                    })
                  }
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault()
                    cycleTab(-1)
                    requestAnimationFrame(() => {
                      document.querySelector<HTMLElement>('.tab.active')?.focus()
                    })
                  }
                  if (e.key === 'Home') {
                    e.preventDefault()
                    activateTabAt(0)
                    requestAnimationFrame(() => {
                      document.querySelector<HTMLElement>('.tab.active')?.focus()
                    })
                  }
                  if (e.key === 'End') {
                    e.preventDefault()
                    activateTabAt(tabs.length - 1)
                    requestAnimationFrame(() => {
                      document.querySelector<HTMLElement>('.tab.active')?.focus()
                    })
                  }
                  if (e.key === 'Delete' && index >= 0) {
                    e.preventDefault()
                    void closeTab(tab.id)
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
        <div
          className="tabbar-rest"
          onDoubleClick={() => createUntitled()}
          title="ダブルクリックで新しいタブ"
        />
      </div>
      {ctxMenu && (
        <TabContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          tabId={ctxMenu.tabId}
          hasOthers={tabs.length > 1}
          onClose={() => setCtxMenu(null)}
        />
      )}
      {active && isMarkdownLanguage(active.language) && !isSettingsTab(active) && <MarkdownToolbar tab={active} />}
    </>
  )
}

function TabContextMenu({
  x,
  y,
  tabId,
  hasOthers,
  onClose
}: {
  x: number
  y: number
  tabId: string
  hasOthers: boolean
  onClose: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [onClose])

  const run = (fn: () => Promise<unknown>): void => {
    onClose()
    void fn()
  }

  const tab = useAppStore.getState().tabs.find((t) => t.id === tabId)
  const canAttachToChat = Boolean(tab && !isSettingsTab(tab))

  return (
    <div
      ref={ref}
      className="tab-ctx-menu"
      style={{ left: x, top: y }}
      role="menu"
    >
      {canAttachToChat ? (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              run(() => {
                addFileTabToChat(tabId)
                return Promise.resolve()
              })
            }
          >
            チャットに追加
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              run(() => copyFileTabChatRef(tabId).then(() => undefined))
            }
          >
            チャット参照をコピー
          </button>
          <div style={{ height: 4 }} />
        </>
      ) : null}
      <button
        type="button"
        role="menuitem"
        onClick={() => run(() => saveTab(tabId, false).then(() => undefined))}
      >
        保存
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => run(() => saveTab(tabId, true).then(() => undefined))}
      >
        別名で保存
      </button>
      <button type="button" role="menuitem" onClick={() => run(() => reloadTabFromDisk(tabId))}>
        再読み込み
      </button>
      <div style={{ height: 4 }} />
      <button type="button" role="menuitem" onClick={() => run(() => closeTab(tabId))}>
        閉じる
      </button>
      {hasOthers && (
        <button type="button" role="menuitem" onClick={() => run(() => closeOtherTabs(tabId))}>
          他を閉じる
        </button>
      )}
      <button type="button" role="menuitem" onClick={() => run(() => closeAllTabs())}>
        すべて閉じる
      </button>
    </div>
  )
}

function MarkdownToolbar({ tab }: { tab: TabInfo }): React.JSX.Element {
  return (
    <div className="md-toolbar">
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
