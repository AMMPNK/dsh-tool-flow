[English](./README.md) | [中文](./README.zh.md)

# dsh-tool-flow

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) web client plugin that folds every root tool call / slash command in one agent turn into a compact, collapsible trajectory card, and renders the assistant turn's reasoning (Think), text, images, and embedded tool calls together.

![Preview](./screenshot.png)

## Why

The stock DeepSeek Harness web UI renders every tool call, slash command, and result as its own message row. A single agentic turn that shells out to a handful of tools floods the chat with dozens of noisy entries — the model's reasoning gets buried, the final answer gets pushed off-screen, and "what just happened" turns into an archaeology project.

This plugin changes that. It folds each turn's tool activity into one compact, collapsible card — running calls glow with a live status dot and auto-expand; settled calls shrink to a one-line summary (count, errors, duration). The model's chain-of-thought becomes a tidy collapsible "⌘ Think" row, and the answer reads like the answer again. Tool calls stop being noise and become a glanceable trail you can open when you care.

## Features

- **Turn-level tool grouping** — all root tool calls and slash commands in one turn collapse into a single card.
- **Live states** — running calls show an amber dot and auto-expand with a scrolling viewport; settled calls collapse to a one-line summary with counts, errors, and duration.
- **Assistant turn rendering** — reasoning blocks render as a collapsible "⌘ Think" row; text goes through the harness markdown renderer; images go through the attachment gallery; nested (non-root) tool calls render inline.
- **Native details preserved** — every call remains inspectable through the harness details panel.

## Install

Build a tarball and add it to a web profile:

```sh
pnpm install
pnpm build
pnpm pack
dsh plugin --profile web add ./dsh-tool-flow-0.1.0.tgz
```

## Development

```sh
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm build       # esbuild bundle + emit type declarations
```

The bundle is client-only (browser UI). Peer dependencies are provided by the harness web surface:

- `@deepseek-ai/dsh-client-runtime`
- `@deepseek-ai/dsh-client-ui-conversation`
- `@deepseek-ai/dsh-client-ui-slots`
- `@deepseek-ai/dsh-client-ui-tool`
- `@deepseek-ai/dsh-client-ui-primitives`
- `@deepseek-ai/dsh-client-ui-attachment`

## How it works

The plugin registers three `conversation.chat.node` slots:

| Node kind | Component | Behavior |
|-----------|-----------|----------|
| `tool-call` / `command` | `ActivityFlow` | Folds contiguous same-turn calls into one card. |
| `assistant-step` | `AssistantMixed` | Renders reasoning / text / image / embedded tool-call blocks. |

## License

[MIT](./LICENSE)
