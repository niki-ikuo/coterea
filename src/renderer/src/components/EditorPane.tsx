import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'
import { bindEditor, getTabDoc, unbindEditor } from '../lib/docs'
import { setActiveEditor } from '../lib/editorHandle'
import { markDirty, sendPresence } from '../lib/collab'
import { useAppStore } from '../store'

type Props = {
  tabId: string
}

export function EditorPane({ tabId }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const boundId = useRef<string | null>(null)
  const setCursor = useAppStore((s) => s.setCursor)

  useEffect(() => {
    if (!hostRef.current) return
    const editor = monaco.editor.create(hostRef.current, {
      theme: 'coterea',
      automaticLayout: true,
      fontSize: 14,
      fontFamily: 'Cascadia Code, Consolas, Meiryo, sans-serif',
      minimap: { enabled: false },
      wordWrap: 'on',
      padding: { top: 12 },
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      renderLineHighlight: 'line',
      scrollbar: { verticalScrollbarSize: 10 }
    })
    editorRef.current = editor
    setActiveEditor(editor)
    editor.layout()

    editor.onDidChangeCursorPosition((e) => {
      setCursor(e.position.lineNumber, e.position.column)
    })
    editor.onDidChangeModelContent(() => {
      const id = boundId.current
      if (id) markDirty(id)
    })

    return () => {
      if (boundId.current) unbindEditor(boundId.current)
      setActiveEditor(null)
      editor.dispose()
      editorRef.current = null
    }
  }, [setCursor])

  useEffect(() => {
    const editor = editorRef.current
    const tab = getTabDoc(tabId)
    if (!editor || !tab) return
    if (boundId.current && boundId.current !== tabId) unbindEditor(boundId.current)
    editor.setModel(tab.model)
    bindEditor(tabId, editor)
    boundId.current = tabId
    editor.layout()
    sendPresence()
    const pos = editor.getPosition()
    if (pos) setCursor(pos.lineNumber, pos.column)
  }, [tabId, setCursor])

  return <div className="editor-host" ref={hostRef} />
}
