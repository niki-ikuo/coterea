import { useEffect, useState } from 'react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import { getTabDoc } from '../lib/docs'
import { mdHeadings, parseMdSections, sectionAtLine, type MdSection } from '../lib/mdSync'
import { getActiveEditor } from '../lib/editorHandle'

type Props = {
  tabId: string
}

export function MdOutline({ tabId }: Props): React.JSX.Element {
  const [headings, setHeadings] = useState<MdSection[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    const doc = getTabDoc(tabId)
    if (!doc) {
      setHeadings([])
      return
    }
    const refresh = (): void => {
      const sections = parseMdSections(doc.model.getValue())
      setHeadings(mdHeadings(sections))
      const editor = getActiveEditor()
      const line = editor?.getPosition()?.lineNumber ?? 1
      setActive(sectionAtLine(sections, line))
    }
    refresh()
    const dispContent = doc.model.onDidChangeContent(() => refresh())
    const editor = getActiveEditor()
    const dispCursor = editor?.onDidChangeCursorPosition(() => refresh())
    return () => {
      dispContent.dispose()
      dispCursor?.dispose()
    }
  }, [tabId])

  return (
    <nav className="md-outline" aria-label="見出し">
      <div className="md-outline-title">見出し</div>
      {headings.length === 0 ? (
        <p className="md-outline-empty">見出しはありません</p>
      ) : (
        <ul>
          {headings.map((item) => (
            <li key={`${item.line}-${item.index}`}>
              <button
                type="button"
                className={`md-outline-item level-${item.level}${active === item.index ? ' on' : ''}`}
                onClick={() => {
                  const editor = getActiveEditor()
                  if (!editor) return
                  editor.revealLineInCenter(item.line, monaco.editor.ScrollType.Smooth)
                  editor.setPosition({ lineNumber: item.line, column: 1 })
                  editor.focus()
                }}
              >
                {item.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}
