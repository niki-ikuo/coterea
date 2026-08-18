import { useCallback, useEffect, useState } from 'react'
import type { HelpCommandId } from '../../shared/help'
import { parseTheme } from '../../shared/theme'
import { HelpDialog } from './components/HelpDialog'

export function HelpApp(): React.JSX.Element {
  const [configured, setConfigured] = useState(false)
  const initialDoc = new URLSearchParams(window.location.search).get('doc') || 'index.md'

  useEffect(() => {
    void (async () => {
      const settings = await window.coterea.settings.get()
      document.documentElement.dataset.theme = parseTheme(settings.theme)
      const status = await window.coterea.ai.status()
      setConfigured(status.configured)
    })()
    const offSettings = window.coterea.settings.onChange((settings) => {
      document.documentElement.dataset.theme = parseTheme(settings.theme)
    })
    const offAi = window.coterea.ai.onStatus((status) => setConfigured(status.configured))
    return () => {
      offSettings()
      offAi()
    }
  }, [])

  const onCommand = useCallback((command: HelpCommandId) => {
    void window.coterea.app.helpCommand(command)
  }, [])

  return (
    <HelpDialog
      initialDocId={initialDoc}
      showAiHelp={configured}
      onClose={() => window.close()}
      onCommand={onCommand}
      onOpenAsk={() => {
        void window.coterea.app.showAiHelp()
      }}
    />
  )
}
