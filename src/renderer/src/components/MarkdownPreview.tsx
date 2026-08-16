import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import { getTabDoc, getText } from '../lib/docs'

type Props = {
  tabId: string
  onSection?: (index: number) => void
}

export type MarkdownPreviewHandle = {
  revealSection: (index: number) => void
}

function renderMarkdown(src: string): string {
  let n = 0
  const marked = new Marked()
  marked.use({
    gfm: true,
    breaks: true,
    renderer: {
      heading({ tokens, depth }) {
        n += 1
        const text = this.parser.parseInline(tokens)
        return `<h${depth} id="md-sec-${n}">${text}</h${depth}>\n`
      }
    }
  })
  return DOMPurify.sanitize(String(marked.parse(src)), { ADD_ATTR: ['id'] })
}

function sectionFromPreview(el: HTMLElement): number {
  const heads = [...el.querySelectorAll<HTMLElement>('[id^="md-sec-"]')]
  const y = el.scrollTop + 12
  let index = 0
  for (const head of heads) {
    const top = head.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
    if (top <= y) {
      const parsed = Number(head.id.slice('md-sec-'.length))
      if (Number.isFinite(parsed)) index = parsed
    } else break
  }
  return index
}

export const MarkdownPreview = forwardRef<MarkdownPreviewHandle, Props>(function MarkdownPreview(
  { tabId, onSection },
  ref
) {
  const [html, setHtml] = useState('')
  const elRef = useRef<HTMLDivElement>(null)
  const ignore = useRef(false)

  useImperativeHandle(ref, () => ({
    revealSection: (index: number) => {
      const el = elRef.current
      if (!el) return
      ignore.current = true
      if (index <= 0) el.scrollTop = 0
      else {
        const node = el.querySelector<HTMLElement>(`#md-sec-${index}`)
        if (node) {
          const top = node.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
          el.scrollTop = top
        }
      }
      requestAnimationFrame(() => {
        ignore.current = false
      })
    }
  }))

  useEffect(() => {
    let cancelled = false
    const render = (): void => {
      const next = renderMarkdown(getText(tabId) || ' ')
      if (!cancelled) setHtml(next)
    }
    render()
    const model = getTabDoc(tabId)?.model
    const sub = model?.onDidChangeContent(() => render())
    return () => {
      cancelled = true
      sub?.dispose()
    }
  }, [tabId])

  return (
    <div
      ref={elRef}
      className="md-preview"
      onScroll={() => {
        const el = elRef.current
        if (!el || ignore.current || !onSection) return
        onSection(sectionFromPreview(el))
      }}
      onClick={(e) => {
        const anchor = (e.target as HTMLElement).closest('a')
        if (!anchor) return
        e.preventDefault()
        const href = anchor.getAttribute('href')
        if (href && /^https?:\/\//i.test(href)) void window.coterea.app.openExternal(href)
      }}
      dangerouslySetInnerHTML={{ __html: html || '<p class="muted">（空）</p>' }}
    />
  )
})
