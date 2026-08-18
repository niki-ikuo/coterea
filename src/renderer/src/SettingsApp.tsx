import { useEffect, useState } from 'react'
import { THEMES, parseTheme, type ThemeId } from '../../shared/theme'
import { AI_PROVIDERS, parseProviderId, providerById, type AiProviderId } from '../../shared/ai'

export function SettingsApp(): React.JSX.Element {
  const [name, setName] = useState('')
  const [themeDraft, setThemeDraft] = useState<ThemeId>('win-light')
  const [providerId, setProviderId] = useState<AiProviderId>('openai')
  const [apiBaseUrl, setApiBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState('0.2')
  const [maxTokens, setMaxTokens] = useState('8192')
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [clearKey, setClearKey] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void (async () => {
      const settings = await window.coterea.settings.get()
      const theme = parseTheme(settings.theme)
      document.documentElement.dataset.theme = theme
      setName(settings.displayName)
      setThemeDraft(theme)
      const provider = parseProviderId(settings.providerId)
      setProviderId(provider)
      setApiBaseUrl(settings.apiBaseUrl ?? providerById(provider).baseUrl)
      setModel(settings.model ?? 'gpt-4o-mini')
      setTemperature(String(settings.temperature ?? 0.2))
      setMaxTokens(String(settings.maxTokens ?? 8192))
      const status = await window.coterea.ai.status()
      setHasKey(status.hasKey)
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

  const preset = providerById(providerId)

  return (
    <div className="dialog-app">
      <div className="dialog-drag" />
      <form
        className="dialog-body dialog-form settings-scroll"
        onSubmit={(e) => {
          e.preventDefault()
          const trimmed = name.trim()
          if (!trimmed) return
          void (async () => {
            const s = await window.coterea.settings.set({
              displayName: trimmed,
              theme: themeDraft,
              providerId,
              apiBaseUrl,
              model: model.trim(),
              temperature: Number(temperature),
              maxTokens: Number(maxTokens)
            })
            if (clearKey) await window.coterea.ai.setKey('')
            else if (apiKey.trim()) await window.coterea.ai.setKey(apiKey.trim())
            void window.coterea.collab.setDisplayName(s.displayName)
            window.close()
          })()
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

        <h2 className="settings-sub">AI</h2>
        <label>
          プロバイダ
          <select
            value={providerId}
            disabled={!ready}
            onChange={(e) => {
              const next = parseProviderId(e.target.value)
              setProviderId(next)
              const p = providerById(next)
              setApiBaseUrl(p.baseUrl)
              if (p.models[0]) setModel(p.models[0])
            }}
          >
            {AI_PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Base URL
          <input
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            disabled={!ready}
            spellCheck={false}
            placeholder="https://api.openai.com/v1"
          />
        </label>
        <label>
          モデル
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={!ready}
            list="model-suggestions"
            spellCheck={false}
          />
          <datalist id="model-suggestions">
            {preset.models.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </label>
        <label>
          API Key{hasKey && !clearKey ? '（保存済み）' : ''}
          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value)
              setClearKey(false)
            }}
            disabled={!ready || clearKey}
            placeholder={hasKey && !clearKey ? '変更するときだけ入力' : preset.needsKey ? '未設定' : 'Ollama は空で可'}
            autoComplete="off"
          />
        </label>
        {hasKey && (
          <label className="settings-check">
            <input
              type="checkbox"
              checked={clearKey}
              onChange={(e) => {
                setClearKey(e.target.checked)
                if (e.target.checked) setApiKey('')
              }}
            />
            保存済みの Key を削除する
          </label>
        )}
        <label>
          温度
          <input value={temperature} onChange={(e) => setTemperature(e.target.value)} disabled={!ready} />
        </label>
        <label>
          Max tokens
          <input value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} disabled={!ready} />
        </label>
        <p className="muted small">Key は端末内で暗号化して保存し、チャット画面には出しません。</p>

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
