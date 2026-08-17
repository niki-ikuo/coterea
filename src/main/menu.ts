import { Menu, type BrowserWindow } from 'electron'
import { THEMES, type ThemeId } from '../shared/theme'
import { zoomIn, zoomOut, zoomReset } from './zoom'
import { showAboutWindow } from './about'
import { showSettingsWindow } from './settingsWindow'

export function buildMenu(
  win: BrowserWindow,
  recent: string[],
  send: (action: string, extra?: string) => void,
  theme: ThemeId,
  collabPaneVisible: boolean
): void {
  const recentItems =
    recent.length === 0
      ? [{ label: '(なし)', enabled: false }]
      : recent.map((p) => ({
          label: p,
          click: () => send('open-recent', p)
        }))

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'ファイル',
      submenu: [
        { label: '新規', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        { label: '開く...', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { label: '最近使ったファイル', submenu: recentItems },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: '名前を付けて保存...', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-as') },
        { type: 'separator' },
        { label: 'タブを閉じる', accelerator: 'CmdOrCtrl+W', click: () => send('close-tab') },
        { type: 'separator' },
        { label: '設定...', click: () => showSettingsWindow(win, theme) },
        { type: 'separator' },
        { label: '終了', accelerator: 'Alt+F4', click: () => win.close() }
      ]
    },
    {
      label: '編集',
      submenu: [
        { label: '元に戻す', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: 'やり直し', accelerator: 'CmdOrCtrl+Y', click: () => send('redo') },
        { type: 'separator' },
        { role: 'cut', label: '切り取り' },
        { role: 'copy', label: 'コピー' },
        { role: 'paste', label: '貼り付け' },
        { type: 'separator' },
        { label: '検索', accelerator: 'CmdOrCtrl+F', click: () => send('find') },
        { label: '置換', accelerator: 'CmdOrCtrl+H', click: () => send('replace') }
      ]
    },
    {
      label: '表示',
      submenu: [
        {
          label: '共同編集パネル',
          type: 'checkbox',
          checked: collabPaneVisible,
          accelerator: 'CmdOrCtrl+\\',
          click: () => send('toggle-right')
        },
        { type: 'separator' },
        {
          label: 'Markdown',
          submenu: [
            { label: '編集のみ', click: () => send('md-view', 'edit') },
            { label: '左右分割', accelerator: 'CmdOrCtrl+Shift+V', click: () => send('md-view', 'split') },
            { label: 'プレビューのみ', click: () => send('md-view', 'preview') },
            { type: 'separator' },
            { label: '表示を切り替え', accelerator: 'CmdOrCtrl+Shift+M', click: () => send('md-view-cycle') }
          ]
        },
        {
          label: 'テーマ',
          submenu: THEMES.map((item) => ({
            label: item.label,
            type: 'radio' as const,
            checked: theme === item.id,
            click: () => send('theme', item.id)
          }))
        },
        {
          label: '次のタブ',
          click: () => send('next-tab')
        },
        {
          label: '前のタブ',
          click: () => send('prev-tab')
        },
        { type: 'separator' },
        { role: 'reload', label: '再読み込み' },
        { role: 'toggleDevTools', label: '開発者ツール' },
        { type: 'separator' },
        { label: '拡大', accelerator: 'CmdOrCtrl+Plus', click: () => zoomIn(win) },
        { label: '縮小', accelerator: 'CmdOrCtrl+-', click: () => zoomOut(win) },
        { label: 'ズームをリセット', accelerator: 'CmdOrCtrl+0', click: () => zoomReset(win) }
      ]
    },
    {
      label: 'ヘルプ',
      submenu: [
        {
          label: '共同編集について',
          click: () => send('collab-notice')
        },
        { type: 'separator' },
        { label: 'バージョン情報', click: () => showAboutWindow(win, theme) }
      ]
    }
  ]

  try {
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  } catch (err) {
    console.error('[coterea] failed to build application menu', err)
  }
}
