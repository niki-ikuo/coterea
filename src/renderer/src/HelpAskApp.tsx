import { useCallback, useEffect, useState } from 'react'
import type { HelpCommandId } from '../../shared/help'
import { parseTheme } from '../../shared/theme'
import { HelpAskDialog } from './components/HelpAskDialog'

export function HelpAskApp(): React.JSX.Element {
  const [configured, setConfigured] = useState(false)

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
    <HelpAskDialog
      configured={configured}
      onClose={() => window.close()}
      onCommand={onCommand}
      onOpenHelp={() => {
        void window.coterea.app.showHelp()
      }}
      onOpenArticle={(id) => {
        void window.coterea.app.showHelp(id)
      }}
    />
  )
}
