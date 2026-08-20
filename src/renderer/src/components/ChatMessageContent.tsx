import { useState, type ReactNode } from 'react'
import { AnimatedEllipsis, AnimatedStatus } from './AnimatedEllipsis'
import { ChatMarkdown } from './ChatMarkdown'
import { getCodeLabel, parseChatSegments, splitStreamingContent } from '../lib/chatMarkdown'

function CodeAccordion({
  label,
  meta,
  code,
  streaming = false
}: {
  label: string
  meta: ReactNode
  code: string
  streaming?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)

  if (streaming) {
    return (
      <div className="chat-code-block streaming">
        <div className="chat-code-header static">
          <span className="chat-code-chevron">▶</span>
          <span className="chat-code-label">{label}</span>
          <span className="chat-code-meta">{meta}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-code-block">
      <button type="button" className="chat-code-header" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="chat-code-chevron">{open ? '▼' : '▶'}</span>
        <span className="chat-code-label">{label}</span>
        <span className="chat-code-meta">{meta}</span>
      </button>
      {open ? <pre className="chat-code-body">{code}</pre> : null}
    </div>
  )
}

export function ChatMessageContent({
  content,
  isStreaming
}: {
  content: string
  isStreaming?: boolean
}): React.JSX.Element | null {
  if (!content) {
    if (isStreaming) {
      return (
        <span className="chat-streaming">
          <AnimatedEllipsis />
        </span>
      )
    }
    return null
  }

  const { complete, streamingCode } = isStreaming
    ? splitStreamingContent(content)
    : { complete: content, streamingCode: null }

  const segments = parseChatSegments(complete)

  if (segments.length === 0 && !streamingCode) {
    return <ChatMarkdown content={content} showCursor={isStreaming} />
  }

  return (
    <div className="chat-message-body">
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          const isLast = index === segments.length - 1 && !streamingCode
          return (
            <ChatMarkdown key={index} content={segment.content} showCursor={Boolean(isStreaming && isLast)} />
          )
        }
        return <CodeAccordion key={index} label={segment.label} meta={segment.meta} code={segment.code} />
      })}
      {streamingCode ? (
        <CodeAccordion
          label={getCodeLabel(streamingCode.language, streamingCode.code).label}
          meta={<AnimatedStatus label="生成中" />}
          code={streamingCode.code}
          streaming
        />
      ) : null}
    </div>
  )
}
