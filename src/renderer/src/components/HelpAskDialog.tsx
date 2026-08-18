import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { helpCommandLabel, isHelpCommandId, type HelpCommandId } from '../../../shared/help'
import { HelpMarkdown } from './HelpMarkdown'

interface HelpAskDialogProps {
  configured: boolean
  onClose: () => void
  onCommand: (command: HelpCommandId) => void
  onOpenArticle: (docId: string) => void
  onOpenHelp: () => void
}

export function HelpAskDialog({
  configured,
  onClose,
  onCommand,
  onOpenArticle,
  onOpenHelp
}: HelpAskDialogProps): React.JSX.Element {
  const askInputRef = useRef<HTMLTextAreaElement>(null)
  const [askQuestion, setAskQuestion] = useState('')
  const [askAnswer, setAskAnswer] = useState('')
  const [askError, setAskError] = useState<string | null>(null)
  const [askSources, setAskSources] = useState<Array<{ id: string; title: string }>>([])
  const [askCommands, setAskCommands] = useState<HelpCommandId[]>([])
  const [askLoading, setAskLoading] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => askInputRef.current?.focus(), 0)
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', handleKeyDown)
      void window.coterea.help.cancelAsk()
    }
  }, [onClose])

  const handleAsk = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault()
      const question = askQuestion.trim()
      if (!question || askLoading || !configured) return

      setAskLoading(true)
      setAskError(null)
      setAskAnswer('')
      setAskSources([])
      setAskCommands([])

      try {
        const result = await window.coterea.help.ask({ question })
        if (result.cancelled) return
        if (result.error) {
          setAskError(result.error)
          setAskSources(result.sources)
          setAskCommands(result.commands.filter(isHelpCommandId))
          return
        }
        setAskAnswer(result.answer)
        setAskSources(result.sources)
        setAskCommands(result.commands.filter(isHelpCommandId))
      } catch (err) {
        setAskError(err instanceof Error ? err.message : '質問に失敗しました')
      } finally {
        setAskLoading(false)
      }
    },
    [askQuestion, askLoading, configured]
  )

  return (
    <div className="dialog-app help-window">
      <div className="dialog-drag" />
      <div className="modal-header">
        <h2 id="help-ask-dialog-title">AIヘルプ</h2>
        <div className="help-header-actions">
          <button type="button" className="help-header-ask" onClick={onOpenHelp}>
            ヘルプを開く…
          </button>
        </div>
      </div>

      <div className="help-ask-body">
        {!configured ? (
          <div className="help-ask-locked">
            <p>AIヘルプを使うには、設定で API を構成してください。</p>
            <button
              type="button"
              className="help-related-link"
              onClick={() => {
                onCommand('Open Provider')
                onClose()
              }}
            >
              AI 設定を開く
            </button>
          </div>
        ) : (
          <form className="help-ask-form" onSubmit={(event) => void handleAsk(event)}>
            <textarea
              ref={askInputRef}
              className="help-ask-input"
              rows={3}
              value={askQuestion}
              onChange={(event) => setAskQuestion(event.target.value)}
              placeholder="例: Edit と Agent の違いは？"
              aria-label="AIヘルプ"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void handleAsk()
                }
              }}
            />
            <div className="help-ask-actions">
              {askLoading ? (
                <button
                  type="button"
                  className="help-related-link"
                  onClick={() => {
                    void window.coterea.help.cancelAsk()
                    setAskLoading(false)
                  }}
                >
                  停止
                </button>
              ) : (
                <button type="submit" className="primary" disabled={!askQuestion.trim()}>
                  質問する
                </button>
              )}
            </div>
          </form>
        )}

        {askLoading && <p className="help-status">回答を生成中…</p>}
        {askError && <p className="help-error">{askError}</p>}
        {askAnswer ? (
          <div className="help-ask-answer">
            <HelpMarkdown content={askAnswer} />
          </div>
        ) : null}
        {askSources.length > 0 && (
          <div>
            <div className="help-footer-label">参照したヘルプ</div>
            <div className="help-related-links">
              {askSources.map((source) => (
                <button key={source.id} type="button" className="help-related-link" onClick={() => onOpenArticle(source.id)}>
                  {source.title}
                </button>
              ))}
            </div>
          </div>
        )}
        {askCommands.length > 0 && (
          <div>
            <div className="help-footer-label">操作</div>
            <div className="help-command-buttons">
              {askCommands.map((command) => (
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
    </div>
  )
}
