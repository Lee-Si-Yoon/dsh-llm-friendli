# dsh-llm-friendli

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) LLM adapter for [FriendliAI](https://friendli.ai) serverless inference. Friendli speaks the OpenAI-compatible chat-completions API, so this plugin implements the harness `LlmAdapter` contract over it and pulls its model catalog from Friendli at runtime.

## What you get

- **Streaming chat completions** against `https://api.friendli.ai/serverless/v1`, translated into the harness `StreamChunk` protocol (text, reasoning, and tool-call blocks).
- **Dynamic model discovery** — the catalog comes from `GET /models` at runtime; nothing is hand-maintained. Deprecated entries are dropped.
- **Reasoning support** for controllable models via `parse_reasoning` + `include_reasoning`, with an on/off thinking toggle mapped to Friendli's `chat_template_kwargs.enable_thinking`.
- **Stable error codes** — HTTP and transport failures become `LlmError` with codes (`AUTH`, `RATE_LIMIT`, `MODEL_NOT_FOUND`, …); model-list failures are distinct from inference failures.
- **`AbortSignal` forwarding** and mandatory `attributionHeaders()` on every request, per the harness adapter contract.

## Quick start

Add the plugin to a profile and launch the web UI — nothing else to configure:

```bash
npm i -g @deepseek-ai/dsh                       # install the dsh CLI (Node.js required)
dsh plugin --profile web add dsh-llm-friendli   # register the friendli provider
export FRIENDLI_TOKEN="flp_..."                 # your Friendli token
dsh web                                         # friendli provider is live
```

No global install? Prefix each `dsh` with `npx @deepseek-ai/dsh` instead
(`npx @deepseek-ai/dsh web`).

`dsh plugin add` merges this package's bundle patch (`cordis.patch.yml`) into the
profile automatically — you do **not** edit `cordis.patch.yml` by hand. Every
Config field has a default, so the `friendli` provider works out of the box; just
export `FRIENDLI_TOKEN` and pick a Friendli model in the web UI. Confirm the layer
loaded with `dsh --profile web --dump-config` (look for `# == dsh-llm-friendli`).

## Install

Install from npm:

```bash
pnpm add dsh-llm-friendli
```

Or from GitHub for the latest unreleased changes:

```bash
pnpm add github:Lee-Si-Yoon/dsh-llm-friendli
```

Peer dependencies (provided by your harness composition): `@deepseek-ai/dsh-llm`, `@deepseek-ai/cordis`, `@deepseek-ai/schemastery`.

## Authenticate

The token is read from the environment at each request — never inline it in a config file or commit it.

```bash
export FRIENDLI_TOKEN="flp_..."
```

Get a token from the [Friendli dashboard](https://friendli.ai).

## Configure

Add the adapter to your `cordis.yml` and point an agent at a Friendli model id. See [`examples/cordis.yml`](examples/cordis.yml) for a complete fragment.

```yaml
- id: dsh-llm-friendli
  name: 'dsh-llm-friendli'
  config:
    apiKeyEnv: FRIENDLI_TOKEN                       # default
    baseURL: https://api.friendli.ai/serverless/v1  # default
    providers: [friendli]                           # default
    thinking: enabled                               # optional; on/off for controllable models
```

| Config field | Default | Meaning |
|---|---|---|
| `apiKeyEnv` | `FRIENDLI_TOKEN` | Environment variable holding the bearer token |
| `baseURL` | serverless endpoint | Endpoint base; `/chat/completions` and `/models` are appended |
| `providers` | `[friendli]` | Provider route(s) this adapter serves |
| `thinking` | model default | `enabled` / `disabled` for controllable-reasoning models; ignored by always-reasoning models |
| `modelCacheTtlMs` | `60000` | How long the fetched model catalog is cached |

## Use a model

Reference a model by the exact id returned by `GET /models`:

```yaml
- id: agent-loop
  name: '@deepseek-ai/dsh-agent-loop'
  config:
    agents:
      - id: main
        provider: friendli
        model: zai-org/GLM-5.2
```

## Dynamic model discovery

Available models are fetched from Friendli Serverless at runtime, so the list reflects the current catalog rather than a snapshot baked into this package. The set of models — and whether a given request is accepted — depends on the account, region, permissions, and model lifecycle. A model appearing in the public `/models` response does not guarantee every request for it will succeed; permission and lifecycle checks still apply at inference time and surface as an `LlmError`.

## Reasoning

Friendli parses reasoning model-agnostically. This adapter always requests `parse_reasoning: true` + `include_reasoning: true`, so reasoning tokens arrive on `delta.reasoning_content` and become harness `reasoning` blocks.

Models fall into two kinds ([Friendli docs](https://friendli.ai/docs/guides/reasoning)):

- **Always-reasoning** (e.g. `MiniMaxAI/MiniMax-M2.5`) — reason regardless; `thinking` config has no effect.
- **Controllable** (e.g. `zai-org/GLM-5.2`) — `thinking: enabled|disabled` maps to `chat_template_kwargs.enable_thinking`. The adapter advertises an on/off reasoning toggle only for models whose `/models` entry declares a `toggle` capability. Discrete effort levels are not exposed, because the serverless reasoning API is documented only for the on/off `enable_thinking` switch — offering effort levels would promise choices the wire cannot honor.

## Troubleshooting

| Symptom | Meaning |
|---|---|
| `MISSING_CREDENTIAL` | `FRIENDLI_TOKEN` (or your `apiKeyEnv`) is unset or blank |
| `AUTH` (401) | Invalid or expired token |
| `FORBIDDEN` (403) | Account lacks access to the model |
| `MODEL_NOT_FOUND` (404) | Model id unavailable or deprecated |
| `RATE_LIMIT` (429) | Friendli rate limit reached |
| `SERVER` (5xx) | Temporary provider-side failure |
| `MODEL_LIST_FAILED` | Runtime `GET /models` discovery failed (distinct from an inference failure) |

## Develop

```bash
pnpm install
pnpm run lint:all   # typecheck + tests in one pass
pnpm run build
```

## Publish to the community plugin store

There is no official DeepSeek plugin hub. The community [DSH Plugin Store](https://github.com/wink-run/dsh-plugin-store) crawls every GitHub repo tagged with the `dsh-plugin` topic hourly — no PR or review. This repo carries that topic, so once it is public it is picked up automatically. The store performs no vetting; review any third-party plugin before installing.

## License

MIT © Lee-Si-Yoon
