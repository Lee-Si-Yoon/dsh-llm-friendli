# dsh-llm-friendli

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that adds [FriendliAI](https://friendli.ai) as an LLM provider. Friendli speaks the OpenAI-compatible chat API, so the adapter implements the harness `LlmAdapter` contract over it and fetches the model catalog from Friendli at runtime.

## Quick start

Install the `dsh` CLI, add the plugin to a profile, export your key, and launch:

```bash
npm i -g @deepseek-ai/dsh                       # the dsh CLI (needs Node.js)
dsh plugin --profile web add dsh-llm-friendli   # register the friendli provider
export FRIENDLI_API_KEY="flp_..."               # your Friendli key
dsh web                                         # friendli is now a provider
```

That's it. `dsh plugin add` merges the plugin's bundle patch into the profile, so the `friendli` provider is registered with working defaults — no config file to touch. Open the web UI, pick a Friendli model, and go. The model list is pulled live from Friendli.

Prefer not to install globally? Prefix each command with `npx @deepseek-ai/dsh` instead.

Confirm the layer loaded without booting:

```bash
dsh --profile web --dump-config   # look for a "# == dsh-llm-friendli" layer
```

Get a key from the [Friendli dashboard](https://friendli.ai). It's read from the environment on every request, so never inline it in a config file or commit it.

## Configuration

The defaults work out of the box. To override any of them, add a config block in your profile's own `cordis.patch.yml`:

```yaml
- id: dsh-llm-friendli
  name: 'dsh-llm-friendli'
  config:
    apiKeyEnv: FRIENDLI_API_KEY                     # default
    baseURL: https://api.friendli.ai/serverless/v1  # default
    providers: [friendli]                           # default
    thinking: enabled                               # optional; on/off for controllable models
    modelCacheTtlMs: 60000                          # default; model-catalog cache
```

To use it outside `dsh web`, point an agent at a Friendli model id (as returned by `GET /models`). See [`examples/cordis.yml`](examples/cordis.yml) for a full fragment.

```yaml
- id: agent-loop
  name: '@deepseek-ai/dsh-agent-loop'
  config:
    agents:
      - id: main
        provider: friendli
        model: zai-org/GLM-5.2
```

## Reasoning

Friendli parses reasoning model-agnostically. The adapter always requests `parse_reasoning: true` and `include_reasoning: true`, so reasoning tokens arrive on `delta.reasoning_content` and become harness `reasoning` blocks. Two kinds of model ([Friendli docs](https://friendli.ai/docs/guides/reasoning)):

- **Always-reasoning** (e.g. `MiniMaxAI/MiniMax-M2.5`) reason regardless; the `thinking` config does nothing.
- **Controllable** (e.g. `zai-org/GLM-5.2`) map `thinking: enabled|disabled` to `chat_template_kwargs.enable_thinking`. The adapter exposes an on/off toggle only for models whose `/models` entry declares a `toggle` capability. It does not expose discrete effort levels, because the serverless reasoning API documents only the on/off switch.

## Troubleshooting

| Code | Meaning |
|---|---|
| `MISSING_CREDENTIAL` | `FRIENDLI_API_KEY` (or your `apiKeyEnv`) is unset or blank |
| `AUTH` (401) | Invalid or expired key |
| `FORBIDDEN` (403) | Account lacks access to the model |
| `MODEL_NOT_FOUND` (404) | Model id unavailable or deprecated |
| `RATE_LIMIT` (429) | Friendli rate limit reached |
| `SERVER` (5xx) | Temporary provider-side failure |
| `MODEL_LIST_FAILED` | Runtime `GET /models` discovery failed (distinct from an inference failure) |

## Install as a dependency

To vendor the adapter into your own harness composition instead of a profile:

```bash
pnpm add dsh-llm-friendli                          # from npm
pnpm add github:Lee-Si-Yoon/dsh-llm-friendli       # or the latest from GitHub
```

Peer dependencies (from your harness): `@deepseek-ai/dsh-llm`, `@deepseek-ai/cordis`, `@deepseek-ai/schemastery`.

## Develop

```bash
pnpm install
pnpm run lint:all   # typecheck + tests in one pass
pnpm run build
```

## License

MIT © Lee-Si-Yoon
