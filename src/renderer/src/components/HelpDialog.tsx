import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import {
  helpCommandLabel,
  isHelpCommandId,
  resolveHelpId,
  type HelpCommandId,
  type HelpDoc,
  type HelpDocMeta,
  type HelpSearchHit
} from '../../../shared/help'
import { HelpMarkdown } from './HelpMarkdown'

interface HelpDialogProps {
  initialDocId?: string
  onClose: () => void
  onCommand: (command: HelpCommandId) => void
  onOpenAsk: () => void
  showAiHelp?: boolean
}

export function HelpDialog({
  initialDocId = 'index.md',
  onClose,
  onCommand,
  onOpenAsk,
  showAiHelp = false
}: HelpDialogProps): React.JSX.Element {
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [docs, setDocs] = useState<HelpDocMeta[]>([])
  const [hits, setHits] = useState<HelpSearchHit[]>([])
  const [doc, setDoc] = useState<HelpDoc | null>(null)
  const [activeId, setActiveId] = useState(initialDocId)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadDoc = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const next = await window.coterea.help.get(id)
      setDoc(next)
      setActiveId(next.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ヘルプを読み込めませんでした')
      setDoc(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setQuery('')
    setHits([])
    setActiveId(initialDocId)
    void loadDoc(initialDocId)
    void window.coterea.help.list().then(setDocs).catch(() => setDocs([]))
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0)

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [initialDocId, loadDoc, onClose])

  useEffect(() => {
    return window.coterea.help.onOpenDoc((id) => {
      setQuery('')
      void loadDoc(id)
    })
  }, [loadDoc])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits([])
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      void window.coterea.help.search(q).then((result) => {
        if (!cancelled) setHits(result)
      })
    }, 120)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  const sidebarItems = query.trim() ? hits : docs

  const handleContentClick = (event: MouseEvent<HTMLDivElement>): void => {
    const target = (event.target as HTMLElement).closest('a')
    if (!target) return
    const href = target.getAttribute('href')
    if (!href) return

    if (/^https?:\/\//i.test(href)) {
      event.preventDefault()
      void window.coterea.app.openExternal(href)
      return
    }

    if (href.toLowerCase().includes('.md')) {
      event.preventDefault()
      const resolved = resolveHelpId(activeId, href)
      setQuery('')
      void loadDoc(resolved)
    }
  }

  return (
    <div className="dialog-app help-window">
      <div className="dialog-drag" />
      <div className="modal-header">
        <h2 id="help-dialog-title">ヘルプ</h2>
        <div className="help-header-actions">
          {showAiHelp && (
            <button type="button" className="help-header-ask" onClick={onOpenAsk}>
              AIヘルプ…
            </button>
          )}
        </div>
      </div>

      <div className="help-layout">
        <aside className="help-sidebar">
          <input
            ref={searchRef}
            className="help-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="キーワードで検索…"
            aria-label="キーワードで検索…"
          />
          <div className="help-sidebar-list" role="listbox" aria-label="トピック">
            {sidebarItems.length === 0 ? (
              <p className="help-sidebar-empty">{query.trim() ? '一致するヘルプがありません' : 'トピックがありません'}</p>
            ) : (
              sidebarItems.map((item) => {
                const snippet = 'snippet' in item ? item.snippet : undefined
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={item.id === activeId}
                    className={`help-sidebar-item${item.id === activeId ? ' active' : ''}`}
                    onClick={() => void loadDoc(item.id)}
                  >
                    <span className="help-sidebar-item-title">{item.title}</span>
                    {snippet ? <span className="help-sidebar-item-snippet">{snippet}</span> : null}
                  </button>
                )
              })
            )}
          </div>
        </aside>

        <section className="help-content">
          {loading && <p className="help-status">読み込み中…</p>}
          {error && <p className="help-error">{error}</p>}
          {!loading && !error && doc && (
            <>
              <div onClick={handleContentClick}>
                <HelpMarkdown content={doc.body} />
              </div>
              {(doc.related.length > 0 || doc.commands.length > 0) && (
                <div className="help-footer">
                  {doc.related.length > 0 && (
                    <div>
                      <div className="help-footer-label">関連</div>
                      <div className="help-related-links">
                        {doc.related.map((relatedId) => {
                          const meta = docs.find((d) => d.id === relatedId)
                          return (
                            <button
                              key={relatedId}
                              type="button"
                              className="help-related-link"
                              onClick={() => void loadDoc(relatedId)}
                            >
                              {meta?.title ?? relatedId}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {doc.commands.length > 0 && (
                    <div>
                      <div className="help-footer-label">操作</div>
                      <div className="help-command-buttons">
                        {doc.commands.filter(isHelpCommandId).map((command) => (
                          <button
                            key={command}
                            type="button"
                            className="help-related-link"
                            onClick={() => {
                              onCommand(command)
                              onClose()
                            }}
                          >
                            {helpCommandLabel(command)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
