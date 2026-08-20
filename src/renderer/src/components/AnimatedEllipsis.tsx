/** 進行中ステータス用のアニメーション付き "..." */
export function AnimatedEllipsis(): React.JSX.Element {
  return (
    <span className="animated-ellipsis" aria-hidden="true">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  )
}

/** ラベル＋アニメーション点（例: 生成中…） */
export function AnimatedStatus({ label }: { label: string }): React.JSX.Element {
  return (
    <span className="animated-status">
      {label}
      <AnimatedEllipsis />
    </span>
  )
}
