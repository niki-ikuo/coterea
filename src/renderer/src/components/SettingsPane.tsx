import { useEffect, useRef, useState } from 'react'
import { THEMES, parseTheme, type ThemeId } from '../../../shared/theme'
import {
  AI_DEFAULT_MAX_STEPS,
  AI_DEFAULT_MAX_TOKENS,
  AI_PROVIDERS,
  clampMaxSteps,
  clampMaxTokens,
  clampTemperature,
  parseProviderId,
  providerById,
  type AiProviderId
} from '../../../shared/ai'
import { setMdOutlineEnabled, setMinimapEnabled } from '../lib/actions'
import { applyLoadedMonacoTheme } from '../lib/editorReady'
import { applyUiTheme } from '../lib/uiTheme'
import {
  onSettingsSection,
  requestedSettingsSection,
  setSettingsReverter,
  setSettingsSaver,
  type SettingsSection
} from '../lib/settingsTab'
import { useAppStore } from '../store'

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'general', label: '一般' },
  { id: 'appearance', label: '外観' },
  { id: 'ai', label: 'AI' }
]

export function SettingsPane(): React.JSX.Element {
  const [section, setSection] = useState<SettingsSection>(requestedSettingsSection)
  const [name, setName] = useState('')
  const [themeDraft, setThemeDraft] = useState<ThemeId>('win-light')
  const [savedTheme, setSavedTheme] = useState<ThemeId>('win-light')
  const minimapEnabled = useAppStore((s) => s.minimapEnabled)
  const mdOutlineEnabled = useAppStore((s) => s.mdOutlineEnabled)
  const [providerId, setProviderId] = useState<AiProviderId>('openai')
  const [apiBaseUrl, setApiBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState('0.2')
  const [maxTokens, setMaxTokens] = useState(String(AI_DEFAULT_MAX_TOKENS))
  const [maxAgentSteps, setMaxAgentSteps] = useState(String(AI_DEFAULT_MAX_STEPS))
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clearingKey, setClearingKey] = useState(false)

  const markDirty = (): void => {
    useAppStore.getState().setTabs((tabs) =>
      tabs.map((t) => (t.kind === 'settings' && !t.isDirty ? { ...t, isDirty: true } : t))
    )
  }

  const markClean = (): void => {
    useAppStore.getState().setTabs((tabs) =>
      tabs.map((t) => (t.kind === 'settings' ? { ...t, isDirty: false } : t))
    )
  }

  const applyThemePreview = (theme: ThemeId): void => {
    useAppStore.getState().setTheme(theme)
    applyUiTheme(theme)
    void applyLoadedMonacoTheme(theme)
  }

  const revert = async (): Promise<void> => {
    applyThemePreview(savedTheme)
  }

  const save = async (): Promise<boolean> => {
    const trimmed = name.trim()
    if (!trimmed) return false
    setSaving(true)
    try {
      const s = await window.coterea.settings.set({
        displayName: trimmed,
        theme: themeDraft,
        providerId,
        apiBaseUrl,
        model: model.trim(),
        temperature: clampTemperature(Number(temperature)),
        maxTokens: clampMaxTokens(Number(maxTokens)),
        maxAgentSteps: clampMaxSteps(Number(maxAgentSteps))
      })
      if (apiKey.trim()) await window.coterea.ai.setKey(apiKey.trim())
      void window.coterea.collab.setDisplayName(s.displayName)
      setName(s.displayName)
      setSavedTheme(parseTheme(s.theme))
      setApiKey('')
      const status = await window.coterea.ai.status()
      setHasKey(status.hasKey)
      markClean()
      return true
    } finally {
      setSaving(false)
    }
  }

  const saveRef = useRef(save)
  const revertRef = useRef(revert)
  saveRef.current = save
  revertRef.current = revert

  useEffect(() => {
    setSettingsSaver(() => saveRef.current())
    setSettingsReverter(() => revertRef.current())
    return () => {
      setSettingsSaver(null)
      setSettingsReverter(null)
    }
  }, [])

  useEffect(() => onSettingsSection(setSection), [])

  useEffect(() => {
    void (async () => {
      const settings = await window.coterea.settings.get()
      const theme = parseTheme(settings.theme)
      setName(settings.displayName)
      setThemeDraft(theme)
      setSavedTheme(theme)
      const provider = parseProviderId(settings.providerId)
      setProviderId(provider)
      setApiBaseUrl(settings.apiBaseUrl ?? providerById(provider).baseUrl)
      setModel(settings.model ?? 'gpt-4o-mini')
      setTemperature(String(settings.temperature ?? 0.2))
      setMaxTokens(String(settings.maxTokens ?? AI_DEFAULT_MAX_TOKENS))
      setMaxAgentSteps(String(settings.maxAgentSteps ?? AI_DEFAULT_MAX_STEPS))
      const status = await window.coterea.ai.status()
      setHasKey(status.hasKey)
      setReady(true)
    })()
  }, [])

  const preset = providerById(providerId)

  return (
    <div className="settings-pane">
      <nav className="settings-nav" aria-label="設定の分類">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={section === item.id ? 'on' : ''}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <form
        className="settings-body dialog-form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {section === 'general' && (
          <>
            <h1>一般</h1>
            <label>
              表示名
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  markDirty()
                }}
                disabled={!ready}
                autoFocus
              />
            </label>
            <p className="muted small">共同編集の参加者一覧に出る名前です。</p>
          </>
        )}
        {section === 'appearance' && (
          <>
            <h1>外観</h1>
            <label>
              テーマ
              <select
                value={themeDraft}
                disabled={!ready}
                onChange={(e) => {
                  const next = parseTheme(e.target.value)
                  setThemeDraft(next)
                  applyThemePreview(next)
                  markDirty()
                }}
              >
                {THEMES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted small">保存するまで、次回起動には反映しません。</p>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={minimapEnabled}
                disabled={!ready}
                onChange={(e) => {
                  void setMinimapEnabled(e.target.checked)
                }}
              />
              ミニマップを表示
            </label>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={mdOutlineEnabled}
                disabled={!ready}
                onChange={(e) => {
                  void setMdOutlineEnabled(e.target.checked)
                }}
              />
              Markdown の見出しを表示
            </label>
            <p className="muted small">表示メニューからも切り替えできます。すぐ反映され、次回起動にも残ります。</p>
          </>
        )}
        {section === 'ai' && (
          <>
            <h1>AI</h1>
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
                  markDirty()
                }}
              >
                {AI_PROVIDERS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.beta ? `${item.label}（β）` : item.label}
                  </option>
                ))}
              </select>
            </label>
            {preset.beta && (
              <p className="muted small">このプロバイダはβです。接続の検証はまだ行っていません。</p>
            )}
            <label>
              Base URL
              <input
                value={apiBaseUrl}
                onChange={(e) => {
                  setApiBaseUrl(e.target.value)
                  markDirty()
                }}
                disabled={!ready}
                spellCheck={false}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label>
              モデル
              <input
                value={model}
                onChange={(e) => {
                  setModel(e.target.value)
                  markDirty()
                }}
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
              API Key{hasKey ? '（保存済み）' : ''}
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  markDirty()
                }}
                disabled={!ready}
                placeholder={hasKey ? '変更するときだけ入力' : preset.needsKey ? '未設定' : 'Ollama は空で可'}
                autoComplete="off"
              />
            </label>
            {hasKey && (
              <div className="settings-key-actions">
                <button
                  type="button"
                  disabled={!ready || clearingKey}
                  onClick={() => {
                    void (async () => {
                      setClearingKey(true)
                      try {
                        await window.coterea.ai.setKey('')
                        setApiKey('')
                        const status = await window.coterea.ai.status()
                        setHasKey(status.hasKey)
                      } finally {
                        setClearingKey(false)
                      }
                    })()
                  }}
                >
                  保存済みの Key を削除
                </button>
              </div>
            )}
            <label>
              温度
              <input
                value={temperature}
                onChange={(e) => {
                  setTemperature(e.target.value)
                  markDirty()
                }}
                disabled={!ready}
              />
            </label>
            <label>
              Max tokens
              <input
                value={maxTokens}
                onChange={(e) => {
                  setMaxTokens(e.target.value)
                  markDirty()
                }}
                disabled={!ready}
              />
            </label>
            <label>
              Agent の最大ステップ
              <input
                value={maxAgentSteps}
                onChange={(e) => {
                  setMaxAgentSteps(e.target.value)
                  markDirty()
                }}
                disabled={!ready}
              />
            </label>
            <p className="muted small">Ask / Edit は1回で終わります。この値は Agent のツール往復の上限です。</p>
            <p className="muted small">Key は端末内で暗号化して保存し、チャット画面には出しません。</p>
          </>
        )}
        <div className="settings-save-row">
          <button className="primary" type="submit" disabled={!ready || saving}>
            保存
          </button>
        </div>
      </form>
    </div>
  )
}
