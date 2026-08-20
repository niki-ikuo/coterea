import { describe, expect, it } from 'vitest'
import type { AiStreamEvent, AiToolRequest } from '../../shared/api'
import { createAgentPlanState } from '../../shared/agentPlan'
import { executeTool, type ToolRuntime } from './tools'

function runtime(input: {
  mode: ToolRuntime['mode']
  activeTabId: string | null
  snapshot?: (tabId: string) => { id?: string; title?: string; content?: string; error?: string }
}): { rt: ToolRuntime; events: AiStreamEvent[]; asked: AiToolRequest[] } {
  const events: AiStreamEvent[] = []
  const asked: AiToolRequest[] = []
  return {
    events,
    asked,
    rt: {
      requestId: 'r1',
      mode: input.mode,
      activeTabId: input.activeTabId,
      plan: createAgentPlanState(),
      emit: (event) => events.push(event),
      askRenderer: async (req) => {
        asked.push(req)
        if (req.name !== 'snapshot_tab') return '{}'
        const snap = input.snapshot?.(req.tabId) ?? {
          id: req.tabId,
          title: 'notes.md',
          content: 'hello'
        }
        return JSON.stringify(snap)
      }
    }
  }
}

describe('propose_edit', () => {
  it('Edit は誤った tab_id を捨てて添付の主タブを撮る', async () => {
    const { rt, events, asked } = runtime({ mode: 'edit', activeTabId: 'tab-real' })
    const result = await executeTool(
      rt,
      'propose_edit',
      JSON.stringify({
        tab_id: 'hallucinated',
        mode: 'replace_all',
        text: 'clean',
        note: 'ゴミを削除'
      }),
      'c1'
    )
    expect(JSON.parse(result)).toMatchObject({ ok: true })
    expect(asked).toEqual([{ callId: 'c1:snap', name: 'snapshot_tab', tabId: 'tab-real' }])
    const proposal = events.find((e) => e.type === 'proposal')
    expect(proposal?.type === 'proposal' && proposal.proposal.tabId).toBe('tab-real')
  })

  it('Edit で添付が無ければ提案しない', async () => {
    const { rt, events } = runtime({ mode: 'edit', activeTabId: null })
    const result = await executeTool(
      rt,
      'propose_edit',
      JSON.stringify({ mode: 'replace_all', text: 'x' }),
      'c1'
    )
    expect(JSON.parse(result)).toEqual({ error: '添付ファイルがありません' })
    expect(events).toEqual([])
  })
})


describe('update_todo', () => {
  it('計画を更新して plan イベントを出す', async () => {
    const { rt, events } = runtime({ mode: 'agent', activeTabId: 'tab-1' })
    const result = await executeTool(
      rt,
      'update_todo',
      JSON.stringify({
        todos: [
          { id: '1', content: '導入を短くする', status: 'in_progress' },
          { id: '2', content: '用語を揃える', status: 'pending' }
        ]
      }),
      'c1'
    )
    expect(JSON.parse(result)).toMatchObject({ ok: true })
    expect(rt.plan.todos).toHaveLength(2)
    const plan = events.find((e) => e.type === 'plan')
    expect(plan?.type === 'plan' && plan.plan.todos[0].content).toBe('導入を短くする')
  })
})
