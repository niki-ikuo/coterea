import { describe, expect, it } from 'vitest'
import {
  applyUpdateTodo,
  countOpenTodos,
  createAgentPlanState,
  extractUserPrompt,
  formatOpenTodosNudge,
  looksLikeMultiPartAgentTask,
  shouldNudgeMissingTodoPlan,
  shouldNudgeOversizedTodoPlan,
  shouldPlanFirstAgentTask,
  shouldHintCoarseAgentPlan
} from './agentPlan'

describe('applyUpdateTodo', () => {
  it('replaces the full list', () => {
    const state = createAgentPlanState()
    const result = applyUpdateTodo(state, {
      todos: [
        { id: '1', content: '導入を短くする', status: 'pending' },
        { id: '2', content: '用語を揃える', status: 'in_progress' }
      ]
    })
    expect(result.ok).toBe(true)
    expect(state.todos).toHaveLength(2)
    expect(countOpenTodos(state)).toBe(2)
  })

  it('merges by id', () => {
    const state = createAgentPlanState()
    applyUpdateTodo(state, {
      todos: [{ id: '1', content: 'A', status: 'pending' }]
    })
    applyUpdateTodo(state, {
      merge: true,
      todos: [{ id: '1', content: 'A', status: 'done' }]
    })
    expect(state.todos[0].status).toBe('done')
    expect(countOpenTodos(state)).toBe(0)
  })

  it('rejects empty todos', () => {
    const state = createAgentPlanState()
    expect(applyUpdateTodo(state, { todos: [] }).ok).toBe(false)
  })

  it('caps at 8 items', () => {
    const state = createAgentPlanState()
    const todos = Array.from({ length: 10 }, (_, i) => ({
      id: String(i + 1),
      content: `item ${i + 1} deliverable`,
      status: 'pending'
    }))
    const result = applyUpdateTodo(state, { todos })
    expect(result.ok).toBe(true)
    expect(state.todos).toHaveLength(8)
    expect(result.summary).toContain('capped')
  })
})

describe('plan heuristics', () => {
  it('detects multi-part Japanese asks', () => {
    expect(shouldPlanFirstAgentTask('導入を短くして、用語も揃えて、見出しも直してください')).toBe(true)
    expect(looksLikeMultiPartAgentTask('1. 直す\n2. テストする')).toBe(true)
    expect(shouldPlanFirstAgentTask('導入って何？')).toBe(false)
  })

  it('nudges missing plan until update_todo runs', () => {
    expect(
      shouldNudgeMissingTodoPlan({
        userText: 'notes.md と outline.md を整理して、見出しも直してください',
        openTodoCount: 0,
        updateTodoCalledThisRun: false,
        alreadyNudging: false
      })
    ).toBe(true)
    expect(
      shouldNudgeMissingTodoPlan({
        userText: 'notes.md と outline.md を整理して、見出しも直してください',
        openTodoCount: 0,
        updateTodoCalledThisRun: true,
        alreadyNudging: false
      })
    ).toBe(false)
  })

  it('nudges oversized plans', () => {
    expect(
      shouldNudgeOversizedTodoPlan({
        activeTodoCount: 6,
        updateTodoCalledThisRun: true,
        alreadyNudging: false
      })
    ).toBe(true)
  })

  it('formats open todo nudge', () => {
    const state = createAgentPlanState()
    applyUpdateTodo(state, {
      todos: [{ id: '1', content: 'まだ', status: 'pending' }]
    })
    expect(formatOpenTodosNudge(state)).toContain('未完了')
  })

  it('hints coarse phase-only plans', () => {
    const state = createAgentPlanState()
    applyUpdateTodo(state, {
      todos: [
        { id: '1', content: '調査', status: 'pending' },
        { id: '2', content: '実装', status: 'pending' }
      ]
    })
    expect(shouldHintCoarseAgentPlan(state)).toBe(true)
  })

  it('extracts user prompt from formatted message', () => {
    expect(extractUserPrompt('[添付]\nbody\n\n[ユーザー]\n直して')).toBe('直して')
  })
})
