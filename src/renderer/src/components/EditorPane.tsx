import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import type { MarkdownPreviewHandle } from './MarkdownPreview'
import { bindEditor, getTabDoc, getText, unbindEditor } from '../lib/docs'
import { setActiveEditor } from '../lib/editorHandle'
import { markDirty, sendPresence, withSuppressDirty } from '../lib/collab'
import { isMarkdownLanguage } from '../lib/fileMeta'
import { monacoThemeOf } from '../lib/monacoEnv'
import { lineOfSection, parseMdSections, sectionAtLine } from '../lib/mdSync'
import { setMdSplitPct } from '../lib/actions'
import { useAppStore } from '../store'
import { MdOutline } from './MdOutline'

const MarkdownPreview = lazy(() => import('./MarkdownPreview').then((m) => ({ default: m.MarkdownPreview })))

type Props = {
  tabId: string
}

export function EditorPane({ tabId }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const previewRef = useRef<MarkdownPreviewHandle>(null)
  const boundId = useRef<string | null>(null)
  const ignoreScroll = useRef(false)
  const lastSection = useRef(-1)
  const [mdResizing, setMdResizing] = useState(false)
  const setCursor = useAppStore((s) => s.setCursor)
  const tab = useAppStore((s) => s.tabs.find((item) => item.id === tabId))
  const mdView = tab && isMarkdownLanguage(tab.language) ? tab.mdView : 'edit'
  const showPreview = mdView === 'split' || mdView === 'preview'
  const splitPct = tab?.mdSplitPct ?? 50
  const scrollSync = tab?.mdScrollSync ?? true
  const minimapEnabled = useAppStore((s) => s.minimapEnabled)
  const mdOutlineEnabled = useAppStore((s) => s.mdOutlineEnabled)
  const showOutline = Boolean(tab && isMarkdownLanguage(tab.language) && mdOutlineEnabled && mdView !== 'preview')

  useLayoutEffect(() => {
    if (!hostRef.current) return
    const initialId = tabId
    const initial = getTabDoc(initialId)
    const editor = monaco.editor.create(hostRef.current, {
      model: initial?.model ?? null,
      theme: monacoThemeOf(useAppStore.getState().theme),
      automaticLayout: true,
      fontSize: 14,
      fontFamily: 'Cascadia Code, Consolas, Meiryo, sans-serif',
      minimap: { enabled: useAppStore.getState().minimapEnabled },
      wordWrap: 'on',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      renderLineHighlight: 'line',
      scrollbar: { verticalScrollbarSize: 10 },
      unicodeHighlight: {
        invisibleCharacters: false,
        ambiguousCharacters: false,
        nonBasicASCII: false
      }
    })
    editorRef.current = editor
    setActiveEditor(editor)
    const runUndo = (): void => {
      const id = boundId.current
      if (id) getTabDoc(id)?.undo.undo()
    }
    const runRedo = (): void => {
      const id = boundId.current
      if (id) getTabDoc(id)?.undo.redo()
    }
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ, runUndo)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY, runRedo)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ, runRedo)
    if (initial) {
      withSuppressDirty(() => bindEditor(initialId, editor))
      boundId.current = initialId
      sendPresence()
      const pos = editor.getPosition()
      if (pos) setCursor(pos.lineNumber, pos.column)
    }

    editor.onDidChangeCursorPosition((e) => {
      setCursor(e.position.lineNumber, e.position.column)
    })
    editor.onDidChangeModelContent(() => {
      const id = boundId.current
      if (id) markDirty(id)
    })
    editor.onDidScrollChange(() => {
      if (ignoreScroll.current) return
      const id = boundId.current
      const current = useAppStore.getState().tabs.find((t) => t.id === id)
      if (!id || !current?.mdScrollSync) return
      const range = editor.getVisibleRanges()[0]
      const line = range?.startLineNumber ?? 1
      const index = sectionAtLine(parseMdSections(getText(id)), line)
      if (index === lastSection.current) return
      lastSection.current = index
      previewRef.current?.revealSection(index)
    })

    return () => {
      if (boundId.current) unbindEditor(boundId.current)
      boundId.current = null
      setActiveEditor(null)
      editor.dispose()
      editorRef.current = null
    }
  }, [setCursor])

  useLayoutEffect(() => {
    editorRef.current?.updateOptions({ minimap: { enabled: minimapEnabled } })
  }, [minimapEnabled])

  useLayoutEffect(() => {
    const editor = editorRef.current
    const doc = getTabDoc(tabId)
    if (!editor || !doc) return
    if (boundId.current === tabId) return
    if (boundId.current) unbindEditor(boundId.current)
    editor.setModel(doc.model)
    withSuppressDirty(() => bindEditor(tabId, editor))
    boundId.current = tabId
    sendPresence()
    const pos = editor.getPosition()
    if (pos) setCursor(pos.lineNumber, pos.column)
  }, [tabId, setCursor, mdView, splitPct])

  const onPreviewSection = (index: number): void => {
    const editor = editorRef.current
    if (!editor || !scrollSync || ignoreScroll.current) return
    if (index === lastSection.current) return
    lastSection.current = index
    ignoreScroll.current = true
    editor.revealLineNearTop(lineOfSection(parseMdSections(getText(tabId)), index), monaco.editor.ScrollType.Immediate)
    requestAnimationFrame(() => {
      ignoreScroll.current = false
    })
  }

  return (
    <div
      className={`editor-stage ${mdView}`}
      ref={stageRef}
    >
      {showOutline ? <MdOutline tabId={tabId} /> : null}
      <div className="editor-main" ref={mainRef}>
      <div
        className="editor-host"
        ref={hostRef}
        style={mdView === 'split' ? { flex: `0 0 ${splitPct}%` } : undefined}
      />
      {mdView === 'split' && (
        <div
          className={`md-splitter${mdResizing ? ' active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault()
            const stage = mainRef.current
            if (!stage) return
            setMdResizing(true)
            document.body.classList.add('is-resizing-panels')
            const onMove = (ev: MouseEvent): void => {
              const rect = stage.getBoundingClientRect()
              setMdSplitPct(tabId, ((ev.clientX - rect.left) / rect.width) * 100)
            }
            const onUp = (): void => {
              setMdResizing(false)
              document.body.classList.remove('is-resizing-panels')
              window.removeEventListener('mousemove', onMove)
              window.removeEventListener('mouseup', onUp)
            }
            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
          }}
        />
      )}
      {showPreview && (
        <Suspense fallback={<div className="md-preview-wrap" />}>
          <MarkdownPreview
            ref={previewRef}
            tabId={tabId}
            onSection={mdView === 'split' && scrollSync ? onPreviewSection : undefined}
          />
        </Suspense>
      )}
      </div>
    </div>
  )
}
