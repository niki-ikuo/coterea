import { type MouseEvent, type ReactNode } from 'react'
import { Lexer, type Token, type Tokens } from 'marked'
import { isSafeChatHref } from '../lib/chatMarkdown'

const CHAT_MARKDOWN_OPTIONS = { gfm: true, breaks: true } as const

function renderInline(tokens: Token[] | undefined, keyPrefix: string): ReactNode[] {
  if (!tokens?.length) return []

  const nodes: ReactNode[] = []
  tokens.forEach((token, index) => {
    const key = `${keyPrefix}-${index}`
    switch (token.type) {
      case 'text': {
        const textToken = token as Tokens.Text
        if (textToken.tokens?.length) {
          nodes.push(...renderInline(textToken.tokens, key))
        } else {
          nodes.push(<span key={key}>{textToken.text}</span>)
        }
        break
      }
      case 'strong':
        nodes.push(<strong key={key}>{renderInline((token as Tokens.Strong).tokens, key)}</strong>)
        break
      case 'em':
        nodes.push(<em key={key}>{renderInline((token as Tokens.Em).tokens, key)}</em>)
        break
      case 'del':
        nodes.push(<del key={key}>{renderInline((token as Tokens.Del).tokens, key)}</del>)
        break
      case 'codespan':
        nodes.push(
          <code key={key} className="chat-inline-code">
            {(token as Tokens.Codespan).text}
          </code>
        )
        break
      case 'link': {
        const link = token as Tokens.Link
        if (!isSafeChatHref(link.href)) {
          nodes.push(...renderInline(link.tokens, key))
        } else {
          nodes.push(
            <a key={key} href={link.href} target="_blank" rel="noreferrer noopener">
              {renderInline(link.tokens, key)}
            </a>
          )
        }
        break
      }
      case 'image': {
        const image = token as Tokens.Image
        nodes.push(<span key={key}>{image.text || image.href}</span>)
        break
      }
      case 'br':
        nodes.push(<br key={key} />)
        break
      case 'escape':
        nodes.push(<span key={key}>{(token as Tokens.Escape).text}</span>)
        break
      case 'html':
        break
      default:
        if ('tokens' in token && Array.isArray(token.tokens)) {
          nodes.push(...renderInline(token.tokens as Token[], key))
        } else if ('text' in token && typeof token.text === 'string') {
          nodes.push(<span key={key}>{token.text}</span>)
        }
        break
    }
  })
  return nodes
}

function renderBlocks(tokens: Token[] | undefined, keyPrefix: string, trailing: ReactNode = null): ReactNode[] {
  if (!tokens?.length) {
    return trailing ? [trailing] : []
  }

  let lastRenderableIndex = -1
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i]?.type !== 'space' && tokens[i]?.type !== 'html') {
      lastRenderableIndex = i
      break
    }
  }

  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`
    const trail = trailing && index === lastRenderableIndex ? trailing : null

    switch (token.type) {
      case 'space':
        return null
      case 'paragraph': {
        const p = token as Tokens.Paragraph
        return (
          <p key={key} className="chat-md-p">
            {renderInline(p.tokens, key)}
            {trail}
          </p>
        )
      }
      case 'heading': {
        const h = token as Tokens.Heading
        const level = Math.min(Math.max(h.depth, 1), 4)
        const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4'
        return (
          <Tag key={key} className={`chat-md-h chat-md-h${level}`}>
            {renderInline(h.tokens, key)}
            {trail}
          </Tag>
        )
      }
      case 'list': {
        const list = token as Tokens.List
        const ListTag = list.ordered ? 'ol' : 'ul'
        const lastItemIndex = list.items.length - 1
        return (
          <ListTag
            key={key}
            className="chat-md-list"
            start={list.ordered && list.start ? list.start : undefined}
          >
            {list.items.map((item, itemIndex) => (
              <li key={`${key}-${itemIndex}`} className="chat-md-li">
                {renderBlocks(
                  item.tokens,
                  `${key}-${itemIndex}`,
                  trail && itemIndex === lastItemIndex ? trail : null
                )}
              </li>
            ))}
          </ListTag>
        )
      }
      case 'blockquote': {
        const q = token as Tokens.Blockquote
        return (
          <blockquote key={key} className="chat-md-quote">
            {renderBlocks(q.tokens, key, trail)}
          </blockquote>
        )
      }
      case 'code': {
        const code = token as Tokens.Code
        return (
          <pre key={key} className="chat-md-pre">
            <code>{code.text}</code>
            {trail}
          </pre>
        )
      }
      case 'table': {
        const table = token as Tokens.Table
        return (
          <div key={key} className="chat-md-table-wrap">
            <table className="chat-md-table">
              <thead>
                <tr>
                  {table.header.map((cell, cellIndex) => (
                    <th key={`${key}-h${cellIndex}`}>{renderInline(cell.tokens, `${key}-h${cellIndex}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr key={`${key}-r${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`${key}-r${rowIndex}-c${cellIndex}`}>
                        {renderInline(cell.tokens, `${key}-r${rowIndex}-c${cellIndex}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {trail}
          </div>
        )
      }
      case 'hr':
        return (
          <span key={key} className="chat-md-hr-wrap">
            <hr className="chat-md-hr" />
            {trail}
          </span>
        )
      case 'text': {
        const textToken = token as Tokens.Text
        if (textToken.tokens?.length) {
          return (
            <p key={key} className="chat-md-p">
              {renderInline(textToken.tokens, key)}
              {trail}
            </p>
          )
        }
        return (
          <p key={key} className="chat-md-p">
            {textToken.text}
            {trail}
          </p>
        )
      }
      case 'html':
        return null
      default:
        if ('tokens' in token && Array.isArray(token.tokens)) {
          return <div key={key}>{renderBlocks(token.tokens as Token[], key, trail)}</div>
        }
        return trail ? <span key={key}>{trail}</span> : null
    }
  })
}

function onMarkdownClick(e: MouseEvent<HTMLDivElement>): void {
  const anchor = (e.target as HTMLElement).closest('a')
  if (!anchor) return
  const href = anchor.getAttribute('href')
  if (!isSafeChatHref(href)) {
    e.preventDefault()
    return
  }
  e.preventDefault()
  if (href && /^https?:\/\//i.test(href)) void window.coterea.app.openExternal(href)
}

type Props = {
  content: string
  showCursor?: boolean
}

export function ChatMarkdown({ content, showCursor }: Props): React.JSX.Element {
  const tokens = Lexer.lex(content, CHAT_MARKDOWN_OPTIONS)
  const cursor = showCursor ? <span className="chat-streaming-cursor" aria-hidden /> : null
  return (
    <div className="chat-markdown" onClick={onMarkdownClick}>
      {renderBlocks(tokens, 'b', cursor)}
    </div>
  )
}
