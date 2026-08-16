import { useCallback, useEffect, useState } from 'react'
import type { AboutInfo } from '../../shared/types'
import { parseTheme } from '../../shared/theme'
import appIcon from './assets/icon.svg'

function formatBuiltAt(ms: number): string {
  const date = new Date(ms)
  const stamp = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
    .format(date)
    .replace(/\s/g, ' ')
  return `${stamp} (${relativeJa(ms)})`
}

function relativeJa(ms: number): string {
  const diff = Date.now() - ms
  const minutes = Math.max(0, Math.round(diff / 60_000))
  if (minutes < 1) return 'たった今'
  if (minutes < 60) return `${minutes} 分前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 時間前`
  const days = Math.round(hours / 24)
  return `${days} 日前`
}

function versionBlock(info: AboutInfo): string {
  return [
    `${info.name}: ${info.version} (${info.flavor})`,
    `Date: ${new Date(info.builtAt).toISOString()}`,
    `Electron: ${info.electron}`,
    `Chromium: ${info.chrome}`,
    `Node.js: ${info.node}`,
    `V8: ${info.v8}`,
    `OS: ${info.os}`
  ].join('\n')
}

export function AboutApp(): React.JSX.Element {
  const [info, setInfo] = useState<AboutInfo | null>(null)
  const [updateStatus, setUpdateStatus] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const settings = await window.coterea.settings.get()
      document.documentElement.dataset.theme = parseTheme(settings.theme)
      setInfo(await window.coterea.app.getAboutInfo())
    })()
  }, [])

  const copy = useCallback(() => {
    if (!info) return
    void window.coterea.app.writeClipboard(versionBlock(info)).then(() => {
      window.close()
    })
  }, [info])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        e.preventDefault()
        copy()
      }
      if (e.key === 'Escape') window.close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [copy])

  const checkUpdates = (): void => {
    setUpdateStatus('更新を確認しています…')
    window.setTimeout(() => {
      setUpdateStatus('自動更新にはまだ対応していません。')
    }, 600)
  }

  useEffect(() => {
    return window.coterea.settings.onChange((settings) => {
      document.documentElement.dataset.theme = parseTheme(settings.theme)
    })
  }, [])

  return (
    <div className="dialog-app">
      <div className="dialog-drag" />
      <div className="dialog-body dialog-body-center">
        <img className="about-icon" src={appIcon} alt="" width={128} height={128} />
        <h1 className="about-name">{info?.name ?? 'Coterea'}</h1>
        <p className="about-meta">{info ? `バージョン ${info.version} (${info.flavor})` : ' '}</p>
        <p className="about-meta">{info ? formatBuiltAt(info.builtAt) : ' '}</p>
        <div className="dialog-actions">
          <button type="button" onClick={checkUpdates}>
            更新を確認
          </button>
          <button className="primary" type="button" onClick={copy}>
            バージョン情報をコピー
          </button>
        </div>
        {updateStatus && <p className="about-status">{updateStatus}</p>}
      </div>
      <p className="about-copyright">{info?.copyright ?? ''}</p>
    </div>
  )
}
