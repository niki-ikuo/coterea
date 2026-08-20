import { describe, expect, it, vi } from 'vitest'
import { scrollActiveTabIntoView } from './tabScroll'

function mockContainer(opts: {
  scrollLeft: number
  clientWidth: number
  tabLeft: number
  tabWidth: number
}): HTMLElement {
  const scrollTo = vi.fn()
  const tab = {
    offsetLeft: opts.tabLeft,
    offsetWidth: opts.tabWidth
  } as unknown as HTMLElement
  return {
    scrollLeft: opts.scrollLeft,
    clientWidth: opts.clientWidth,
    scrollTo,
    querySelector: () => tab
  } as unknown as HTMLElement
}

describe('scrollActiveTabIntoView', () => {
  it('左にはみ出していれば左へ寄せる', () => {
    const el = mockContainer({ scrollLeft: 100, clientWidth: 200, tabLeft: 40, tabWidth: 80 })
    scrollActiveTabIntoView(el, '.active')
    expect(el.scrollTo).toHaveBeenCalledWith({ left: 40, behavior: 'smooth' })
  })

  it('右にはみ出していれば右へ寄せる', () => {
    const el = mockContainer({ scrollLeft: 0, clientWidth: 200, tabLeft: 180, tabWidth: 80 })
    scrollActiveTabIntoView(el, '.active')
    expect(el.scrollTo).toHaveBeenCalledWith({ left: 60, behavior: 'smooth' })
  })

  it('見えていれば動かさない', () => {
    const el = mockContainer({ scrollLeft: 0, clientWidth: 300, tabLeft: 40, tabWidth: 80 })
    scrollActiveTabIntoView(el, '.active')
    expect(el.scrollTo).not.toHaveBeenCalled()
  })
})
