import { classifyApplyCollision, type ProposedEdit, type ProposalRebaseKind } from './ai'
import { desiredTextAfterProposal, rebaseProposal } from './textOps'

export const REBASE_CLEAN_NOTE =
  '共同編集の変更を踏まえて差分を更新しました。内容を確認して適用してください。'
export const REBASE_OVERLAP_NOTE =
  '同じ箇所が編集されています。適用すると意図と違う結果になることがあります。内容を確認してください。'

export function withRebasedProposal(
  proposal: ProposedEdit,
  rebase: { next: string; previewBefore: string; kind: ProposalRebaseKind }
): ProposedEdit {
  return {
    ...proposal,
    rebasedAgainst: rebase.previewBefore,
    rebasedText: rebase.next,
    rebaseKind: rebase.kind,
    note: rebase.kind === 'overlap' ? REBASE_OVERLAP_NOTE : REBASE_CLEAN_NOTE
  }
}

export type ProposalApplyDecision =
  | { action: 'apply'; next: string }
  | { action: 'update'; status: 'pending' | 'conflict'; proposal: ProposedEdit }

/**
 * 提案適用の分岐。文書は触らない。
 * stale なら再計算プレビューを返し、overlap は確認フラグ付きで適用。
 */
export function decideProposalApply(input: {
  current: string
  proposal: ProposedEdit
  confirmOverlap?: boolean
}): ProposalApplyDecision {
  const { current, proposal, confirmOverlap = false } = input
  const collision = classifyApplyCollision({ current, proposal })
  if (collision === 'ok') {
    return { action: 'apply', next: desiredTextAfterProposal(current, proposal) }
  }

  const rebase = rebaseProposal(current, proposal)
  const alreadyAgainstCurrent = proposal.rebasedAgainst === current

  if (rebase.kind === 'overlap') {
    if (confirmOverlap && alreadyAgainstCurrent) {
      return { action: 'apply', next: rebase.next }
    }
    return {
      action: 'update',
      status: 'conflict',
      proposal: withRebasedProposal(proposal, { ...rebase, kind: 'overlap' })
    }
  }

  if (alreadyAgainstCurrent && proposal.rebaseKind === 'clean') {
    return { action: 'apply', next: rebase.next }
  }

  return {
    action: 'update',
    status: 'pending',
    proposal: withRebasedProposal(proposal, {
      next: rebase.next,
      previewBefore: rebase.previewBefore,
      kind: 'clean'
    })
  }
}
