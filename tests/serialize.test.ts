import { describe, expect, it } from 'vitest'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { serializeRequest } from '../src/serialize.ts'

/** Minimal one-user-turn request; per-test overrides merge on top. */
function req(overrides: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    provider: 'friendli',
    model: 'zai-org/GLM-5.2',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    ...overrides,
  }
}

describe('serializeRequest reasoning wiring', () => {
  it('always requests the reasoning-content split', () => {
    const body = serializeRequest(req())
    expect(body.parse_reasoning).toBe(true)
    expect(body.include_reasoning).toBe(true)
  })

  it('sends a named effort level verbatim as reasoning_effort', () => {
    const high = serializeRequest(req({ reasoningEffort: ReasoningEffortId('high') }))
    expect(high.reasoning_effort).toBe('high')
    expect(high.chat_template_kwargs).toBeUndefined()

    const max = serializeRequest(req({ reasoningEffort: ReasoningEffortId('max') }))
    expect(max.reasoning_effort).toBe('max')
    expect(max.chat_template_kwargs).toBeUndefined()
  })

  it('maps the off/on toggle to enable_thinking, never reasoning_effort', () => {
    const off = serializeRequest(req({ reasoningEffort: ReasoningEffortId('off') }))
    expect(off.chat_template_kwargs).toEqual({ enable_thinking: false })
    expect(off.reasoning_effort).toBeUndefined()

    const on = serializeRequest(req({ reasoningEffort: ReasoningEffortId('on') }))
    expect(on.chat_template_kwargs).toEqual({ enable_thinking: true })
    expect(on.reasoning_effort).toBeUndefined()
  })

  it('falls back to the adapter thinking default when no effort is selected', () => {
    expect(serializeRequest(req(), { thinking: 'enabled' }).chat_template_kwargs)
      .toEqual({ enable_thinking: true })
    expect(serializeRequest(req(), { thinking: 'disabled' }).chat_template_kwargs)
      .toEqual({ enable_thinking: false })
    // No default, no per-request effort → leave the model's own behavior in place.
    const bare = serializeRequest(req())
    expect(bare.chat_template_kwargs).toBeUndefined()
    expect(bare.reasoning_effort).toBeUndefined()
  })

  it('forces thinking off for a session-title call regardless of effort', () => {
    const body = serializeRequest(
      req({ purpose: 'session-title', reasoningEffort: ReasoningEffortId('max') }),
      { thinking: 'enabled' },
    )
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false })
    expect(body.reasoning_effort).toBeUndefined()
  })
})
