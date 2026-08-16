import { useEffect, useState } from 'react'
import { THEMES, parseTheme, type ThemeId } from '../../shared/theme'

export function SettingsApp(): React.JSX.Element {
  const [name, setName] = useState('')
  const [themeDraft, setThemeDraft] = useState<ThemeId>('win-light')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void (async () => {
      const settings = await window.coterea.settings.get()
      const theme = parseTheme(settings.theme)
      document.documentElement.dataset.theme = theme
      setName(settings.displayName)
      setThemeDraft(theme)
      setReady(true)
    })()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        window.close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="dialog-app">
      <div className="dialog-drag" />
      <form
        className="dialog-body dialog-form"
        onSubmit={(e) => {
          e.preventDefault()
          const trimmed = name.trim()
          if (!trimmed) return
          void window.coterea.settings.set({ displayName: trimmed, theme: themeDraft }).then((s) => {
            void window.coterea.collab.setDisplayName(s.displayName)
            window.close()
          })
        }}
      >
        <h1 className="dialog-heading">設定</h1>
        <label>
          表示名
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={!ready} autoFocus />
        </label>
        <label>
          テーマ
          <select
            value={themeDraft}
            disabled={!ready}
            onChange={(e) => setThemeDraft(parseTheme(e.target.value))}
          >
            {THEMES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={() => window.close()}>
            キャンセル
          </button>
          <button className="primary" type="submit" disabled={!ready}>
            保存
          </button>
        </div>
      </form>
    </div>
  )
}
