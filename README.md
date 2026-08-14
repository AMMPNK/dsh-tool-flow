# dsh-tool-flow

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) web client plugin that groups every root tool call / command in a single agent turn into one compact, collapsible trajectory card, and renders the assistant turn's reasoning, markdown text, images, and embedded tool calls together.

> 一个 DeepSeek Harness Web 客户端插件：把同一回合的根工具调用折叠成一张紧凑的轨迹卡片，并把思维链（Think）、正文、图片与内嵌工具调用统一渲染。

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
