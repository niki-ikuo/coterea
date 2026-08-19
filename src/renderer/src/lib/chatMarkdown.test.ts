import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChatMarkdown } from '../components/ChatMarkdown'
import { isSafeChatHref, parseChatSegments } from './chatMarkdown'
import { createElement } from 'react'

describe('isSafeChatHref', () => {
  it('allows http(s) and mailto', () => {
    expect(isSafeChatHref('https://example.com/a')).toBe(true)
    expect(isSafeChatHref('http://example.com')).toBe(true)
    expect(isSafeChatHref('mailto:a@b.com')).toBe(true)
  })

  it('rejects unsafe or relative hrefs', () => {
    expect(isSafeChatHref('javascript:alert(1)')).toBe(false)
    expect(isSafeChatHref('//evil.test')).toBe(false)
    expect(isSafeChatHref('/local/path')).toBe(false)
    expect(isSafeChatHref('readme.md')).toBe(false)
    expect(isSafeChatHref('')).toBe(false)
  })
})

describe('parseChatSegments', () => {
  it('splits fenced code from surrounding text', () => {
    const segments = parseChatSegments('前\n```ts\nconst a = 1\n```\n後')
    expect(segments).toEqual([
      { type: 'text', content: '前' },
      { type: 'code', language: 'ts', code: 'const a = 1', label: 'ts', meta: '1 行' },
      { type: 'text', content: '後' }
    ])
  })
})

describe('ChatMarkdown', () => {
  it('renders bold, lists, and links', () => {
    const html = renderToStaticMarkup(
      createElement(ChatMarkdown, {
        content: '**Bold**\n\n- one\n- two\n\n[Docs](https://example.com)'
      })
    )
    expect(html).toContain('<strong>')
    expect(html).toContain('Bold')
    expect(html).toContain('<ul')
    expect(html).toContain('<li')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
  })

  it('does not render raw html tokens', () => {
    const html = renderToStaticMarkup(
      createElement(ChatMarkdown, { content: 'Hello <script>alert(1)</script> world' })
    )
    expect(html).not.toContain('<script>')
  })

  it('keeps the streaming cursor inside the last paragraph', () => {
    const html = renderToStaticMarkup(
      createElement(ChatMarkdown, { content: 'Hello world', showCursor: true })
    )
    expect(html).toContain('chat-md-p')
    expect(html).toContain('<span>Hello world</span><span class="chat-streaming-cursor"')
    expect(html).not.toMatch(/<\/p><span class="chat-streaming-cursor"/)
  })
})
