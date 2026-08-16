import { Menu, type BrowserWindow } from 'electron'

export function buildMenu(win: BrowserWindow, recent: string[], send: (action: string, extra?: string) => void): void {
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
        { label: '右パネルを折りたたむ / 開く', accelerator: 'CmdOrCtrl+\\', click: () => send('toggle-right') },
        { type: 'separator' },
        { role: 'reload', label: '再読み込み' },
        { role: 'toggleDevTools', label: '開発者ツール' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'ズームをリセット' },
        { role: 'zoomIn', label: '拡大' },
        { role: 'zoomOut', label: '縮小' }
      ]
    },
    {
      label: '共同編集',
      submenu: [
        { label: '共同編集を開始', click: () => send('collab-start') },
        { label: '参加...', click: () => send('collab-join') },
        { label: '離脱', click: () => send('collab-leave') }
      ]
    },
    {
      label: '設定',
      submenu: [{ label: '表示名...', click: () => send('settings') }]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
