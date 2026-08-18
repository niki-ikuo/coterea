import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEventHandler,
  type ReactNode,
  type RefObject
} from 'react'

type Props = {
  className?: string
  viewClassName?: string
  innerClassName?: string
  children: ReactNode
  pinToBottom?: boolean
  pinKey?: unknown
  contentKey?: unknown
  onViewScroll?: () => void
  onViewClick?: MouseEventHandler<HTMLDivElement>
  scrollerRef?: RefObject<HTMLDivElement | null>
}

export function OverlayScroll({
  className,
  viewClassName,
  innerClassName,
  children,
  pinToBottom,
  pinKey,
  contentKey,
  onViewScroll,
  onViewClick,
  scrollerRef
}: Props): React.JSX.Element {
  const localScroller = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const scroller = scrollerRef ?? localScroller
  const thumbMetrics = useRef({ top: 0, height: 24 })
  const dragOffset = useRef<number | null>(null)
  const [thumb, setThumb] = useState({ top: 0, height: 0, visible: false })

  const updateThumb = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    if (scrollHeight <= clientHeight + 1) {
      thumbMetrics.current = { top: 0, height: 0 }
      setThumb({ top: 0, height: 0, visible: false })
      return
    }
    const trackH = track.current?.clientHeight || clientHeight
    const height = Math.max(24, (clientHeight / scrollHeight) * trackH)
    const maxTop = trackH - height
    const top = maxTop <= 0 ? 0 : (scrollTop / (scrollHeight - clientHeight)) * maxTop
    thumbMetrics.current = { top, height }
    setThumb({ top, height, visible: true })
  }, [scroller])

  const scrollToPointer = useCallback(
    (clientY: number, offset: number) => {
      const el = scroller.current
      const rail = track.current
      if (!el || !rail) return
      const range = el.scrollHeight - el.clientHeight
      if (range <= 0) return
      const rect = rail.getBoundingClientRect()
      const height = thumbMetrics.current.height
      const maxTop = Math.max(1, rail.clientHeight - height)
      const y = Math.min(maxTop, Math.max(0, clientY - rect.top - offset))
      el.scrollTop = (y / maxTop) * range
    },
    [scroller]
  )

  useEffect(() => {
    if (!pinToBottom) return
    const el = scroller.current
    if (!el) return
    if (dragOffset.current === null) el.scrollTop = el.scrollHeight
    updateThumb()
  }, [pinToBottom, pinKey, scroller, updateThumb])

  useEffect(() => {
    updateThumb()
  }, [contentKey, updateThumb])

  useEffect(() => {
    const el = scroller.current
    const content = inner.current
    if (!el) return
    const onScroll = (): void => {
      updateThumb()
      onViewScroll?.()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(updateThumb)
    ro.observe(el)
    if (content) ro.observe(content)
    updateThumb()
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [onViewScroll, scroller, updateThumb])

  return (
    <div className={['overlay-scroll', className].filter(Boolean).join(' ')}>
      <div className={['overlay-scroll-view', viewClassName].filter(Boolean).join(' ')} ref={scroller} onClick={onViewClick}>
        <div className={['overlay-scroll-inner', innerClassName].filter(Boolean).join(' ')} ref={inner}>
          {children}
        </div>
      </div>
      <div
        ref={track}
        className={`overlay-scrollbar${thumb.visible ? '' : ' is-idle'}`}
        onPointerDown={(e) => {
          if (e.button !== 0 || !thumb.visible) return
          const rail = track.current
          if (!rail) return
          e.preventDefault()
          const relY = e.clientY - rail.getBoundingClientRect().top
          const { top, height } = thumbMetrics.current
          const onThumb = relY >= top && relY <= top + height
          const offset = onThumb ? relY - top : height / 2
          dragOffset.current = offset
          rail.setPointerCapture(e.pointerId)
          scrollToPointer(e.clientY, offset)
        }}
        onPointerMove={(e) => {
          if (dragOffset.current === null) return
          scrollToPointer(e.clientY, dragOffset.current)
        }}
        onPointerUp={(e) => {
          dragOffset.current = null
          if (track.current?.hasPointerCapture(e.pointerId)) {
            track.current.releasePointerCapture(e.pointerId)
          }
        }}
        onPointerCancel={() => {
          dragOffset.current = null
        }}
      >
        <div
          className="overlay-scrollbar-thumb"
          style={{ height: `${thumb.height}px`, transform: `translateY(${thumb.top}px)` }}
        />
      </div>
    </div>
  )
}
