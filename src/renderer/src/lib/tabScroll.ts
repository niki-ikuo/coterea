/** 横スクロール可能なタブ列で、対象タブが隠れていれば左右に寄せる。 */
export function scrollActiveTabIntoView(container: HTMLElement | null, activeSelector: string): void {
  if (!container) return
  const tab = container.querySelector<HTMLElement>(activeSelector)
  if (!tab) return

  const cLeft = container.scrollLeft
  const cRight = cLeft + container.clientWidth
  const tLeft = tab.offsetLeft
  const tRight = tLeft + tab.offsetWidth

  if (tLeft < cLeft) {
    container.scrollTo({ left: tLeft, behavior: 'smooth' })
    return
  }
  if (tRight > cRight) {
    container.scrollTo({ left: tRight - container.clientWidth, behavior: 'smooth' })
  }
}
