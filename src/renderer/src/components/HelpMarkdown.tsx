import { useMemo } from 'react'
import { Marked } from 'marked'
import DOMPurify from 'dompurify'

export function HelpMarkdown({ content }: { content: string }): React.JSX.Element {
  const html = useMemo(() => {
    const marked = new Marked()
    marked.use({ gfm: true, breaks: true })
    return DOMPurify.sanitize(String(marked.parse(content || ' ')), { ADD_ATTR: ['id', 'href', 'target', 'rel'] })
  }, [content])
  return <div className="md-preview help-markdown" dangerouslySetInnerHTML={{ __html: html }} />
}
