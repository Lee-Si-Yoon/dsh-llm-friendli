/**
 * Serialize harness messages into Friendli chat completions (OpenAI-compatible).
 * User text is joined; assistant text becomes `content`, tool calls become
 * `tool_calls`, and tool results become separate `role:'tool'` messages.
 * Assistant reasoning is replayed as `reasoning_content` only on tool-call
 * turns. Image content is rejected explicitly because this wire route is
 * text-only.
 *
 * @module dsh-llm-friendli/serialize
 */

import { contentHasImage, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { WireMessage, WireRequest, WireTool } from './types.ts'

/** Adapter-level request defaults resolved from plugin config. */
export interface RequestDefaults {
  /**
   * Controllable-reasoning stance for models that expose a `toggle` capability:
   * `enabled` sends `chat_template_kwargs.enable_thinking=true`, `disabled`
   * sends `false`. Undefined leaves the model's own default in place.
   */
  thinking?: 'enabled' | 'disabled' | undefined
}

/** Join the text blocks of a message (user/tool-result content). */
function flattenText(blocks: readonly ContentBlock[]): string {
  return blocks.filter(block => block.type === 'text').map(block => block.text).join('')
}

/** Reject image content before any text-flattening path can silently drop it. */
function assertTextOnly(blocks: readonly ContentBlock[]): void {
  if (contentHasImage(blocks)) {
    throw new LlmError('The Friendli chat-completions adapter does not support image content.', 'UNSUPPORTED_CONTENT')
  }
}

/** Serialize one assistant message (text + reasoning + tool calls). */
function serializeAssistant(message: Message): WireMessage {
  const text = flattenText(message.content)
  const reasoning = message.content
    .filter(block => block.type === 'reasoning')
    .map(block => block.text)
    .join('')
  const toolCalls = message.content
    .filter(block => block.type === 'tool-call')
    .map(block => ({
      id: block.id,
      type: 'function' as const,
      function: { name: block.name, arguments: block.arguments },
    }))

  return {
    role: 'assistant',
    // Text-less turns send "" — never null; some gateways reject null content.
    content: text,
    // Replay CoT only on tool-call turns (ignored on plain turns; drop to save tokens).
    ...toolCalls.length > 0 && reasoning.length > 0 ? { reasoning_content: reasoning } : {},
    ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {},
  }
}

/**
 * Serialize the conversation. `tool-result` blocks become standalone
 * `{role:'tool'}` messages; a mixed user message contributes its text first
 * and its tool results as separate wire messages after.
 * @param messages - the harness conversation, in order.
 * @returns the wire messages; order preserved.
 */
export function serializeMessages(messages: readonly Message[]): WireMessage[] {
  const wire: WireMessage[] = []
  for (const message of messages) {
    assertTextOnly(message.content)
    if (message.role === 'system') {
      wire.push({ role: 'system', content: flattenText(message.content) })
      continue
    }
    if (message.role === 'assistant') {
      wire.push(serializeAssistant(message))
      continue
    }
    const toolResults = message.content.filter(block => block.type === 'tool-result')
    const text = flattenText(message.content)
    if (text.length > 0 || toolResults.length === 0) {
      wire.push({ role: 'user', content: text })
    }
    for (const result of toolResults) {
      wire.push({
        role: 'tool',
        tool_call_id: result.toolCallId,
        content: flattenText(result.content) || '(no output)',
      })
    }
  }
  return wire
}

/**
 * Resolve the reasoning stance for one request. Friendli controllable models
 * read `enable_thinking` from `chat_template_kwargs`; `parse_reasoning` +
 * `include_reasoning` split the reasoning tokens into `reasoning_content`.
 * We always request the split so the translator gets a clean channel, and
 * gate `enable_thinking` on the resolved on/off stance.
 */
function resolveReasoning(
  options: GenerateOptions,
  defaults: RequestDefaults,
): Pick<WireRequest, 'chat_template_kwargs' | 'parse_reasoning' | 'include_reasoning'> {
  // A session-title call wants visible text, never a thinking budget.
  const thinking = options.purpose === 'session-title' ? 'disabled' : defaults.thinking
  return {
    parse_reasoning: true,
    include_reasoning: true,
    ...thinking !== undefined ? { chat_template_kwargs: { enable_thinking: thinking === 'enabled' } } : {},
  }
}

/**
 * Build the full wire request. Always streaming with usage reporting; optional
 * fields are omitted rather than sent as null so provider defaults apply.
 * @param options - the harness request (model, history, system, tools, sampling).
 * @param defaults - adapter-level reasoning defaults.
 * @returns the chat-completions request body.
 */
export function serializeRequest(options: GenerateOptions, defaults: RequestDefaults = {}): WireRequest {
  const messages: WireMessage[] = []
  if (options.system !== undefined) {
    messages.push({ role: 'system', content: options.system })
  }
  messages.push(...serializeMessages(options.messages))

  const tools: WireTool[] | undefined = options.tools?.map(tool => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }))

  return {
    model: options.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...resolveReasoning(options, defaults),
    ...tools !== undefined && tools.length > 0 ? { tools } : {},
    ...options.temperature !== undefined ? { temperature: options.temperature } : {},
    ...options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens },
    ...options.stop !== undefined ? { stop: options.stop } : {},
  }
}
