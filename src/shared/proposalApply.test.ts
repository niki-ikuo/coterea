import { describe, expect, it } from 'vitest'
import type { ProposedEdit } from './ai'
import { decideProposalApply } from './proposalApply'

function proposal(partial: Partial<ProposedEdit> & Pick<ProposedEdit, 'text' | 'baseText'>): ProposedEdit {
  return {
    tabId: 't',
    tabTitle: 'a.md',
    mode: 'replace_all',
    ...partial
  }
}

describe('decideProposalApply', () => {
  it('一致していれば即 apply', () => {
    const d = decideProposalApply({
      current: 'a',
      proposal: proposal({ text: 'b', baseText: 'a' })
    })
    expect(d).toEqual({ action: 'apply', next: 'b' })
  })

  it('別領域の stale は clean 再計算で pending', () => {
    const base = 'line1\nline2\nline3\n'
    const current = 'line1\nUSER\nline3\n'
    const proposed = 'line1\nline2\nAI\n'
    const d = decideProposalApply({
      current,
      proposal: proposal({ text: proposed, baseText: base })
    })
    expect(d.action).toBe('update')
    if (d.action !== 'update') return
    expect(d.status).toBe('pending')
    expect(d.proposal.rebaseKind).toBe('clean')
    expect(d.proposal.rebasedAgainst).toBe(current)
    expect(d.proposal.rebasedText).toContain('USER')
    expect(d.proposal.rebasedText).toContain('AI')
  })

  it('clean 再計算済みなら apply', () => {
    const base = 'line1\nline2\nline3\n'
    const current = 'line1\nUSER\nline3\n'
    const proposed = 'line1\nline2\nAI\n'
    const first = decideProposalApply({
      current,
      proposal: proposal({ text: proposed, baseText: base })
    })
    expect(first.action).toBe('update')
    if (first.action !== 'update') return
    const second = decideProposalApply({
      current,
      proposal: first.proposal
    })
    expect(second.action).toBe('apply')
    if (second.action !== 'apply') return
    expect(second.next).toContain('USER')
    expect(second.next).toContain('AI')
  })

  it('overlap は conflict、confirm で apply', () => {
    const base = 'hello world'
    const current = 'hello USER'
    const proposed = 'hello AI'
    const first = decideProposalApply({
      current,
      proposal: proposal({ text: proposed, baseText: base })
    })
    expect(first.action).toBe('update')
    if (first.action !== 'update') return
    expect(first.status).toBe('conflict')
    expect(first.proposal.rebaseKind).toBe('overlap')

    const withoutConfirm = decideProposalApply({
      current,
      proposal: first.proposal,
      confirmOverlap: false
    })
    expect(withoutConfirm.action).toBe('update')

    const withConfirm = decideProposalApply({
      current,
      proposal: first.proposal,
      confirmOverlap: true
    })
    expect(withConfirm.action).toBe('apply')
    if (withConfirm.action !== 'apply') return
    expect(withConfirm.next).toContain('USER')
  })

  it('再計算後にさらに文書が変われば再度 update', () => {
    const base = 'line1\nline2\nline3\n'
    const current1 = 'line1\nUSER\nline3\n'
    const proposed = 'line1\nline2\nAI\n'
    const first = decideProposalApply({
      current: current1,
      proposal: proposal({ text: proposed, baseText: base })
    })
    if (first.action !== 'update') throw new Error('expected update')
    const current2 = 'line1\nUSER2\nline3\n'
    const second = decideProposalApply({
      current: current2,
      proposal: first.proposal
    })
    expect(second.action).toBe('update')
    if (second.action !== 'update') return
    expect(second.proposal.rebasedAgainst).toBe(current2)
    expect(second.proposal.rebasedText).toContain('USER2')
  })
})
