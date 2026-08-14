import type { ClientContext, ChatConversationViewNode, ConversationSnapshot, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { JsonBlock, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { ImageGallery } from '@deepseek-ai/dsh-client-ui-attachment'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import css from './styles.css'

export const inject = ['slots']

type ActivityKind = 'tool-call' | 'command'
type ActivityNode = ChatConversationViewNode & { kind: ActivityKind; data: any }
type AssistantProps = ActivityProps & { node: ChatConversationViewNode & { kind: 'assistant-step'; data: { status: string; blocks: readonly any[] } } }
type ToolNode = ActivityNode & { kind: 'tool-call'; data: { root: ToolCallBlock } }
type ActivityProps = {
  node: ChatConversationViewNode
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  inspectCall?: (callId: string) => void
  cwd?: string
  openFile?: (path: string) => void
  renderSlot?: (name: 'tool.call.toolview', owner: { callId: string; toolName: string; block: ToolCallBlock; cwd?: string; openFile: (path: string) => void; inspect?: () => void }) => React.ReactNode
  t?: (key: string, params?: Record<string, unknown>) => string
  loadImage?: (attachment: any) => Promise<string>
  fileMentions?: (owner: any) => any
}
type ActivityGroup = {
  nodes: readonly ActivityNode[]
  tools: readonly ToolCallBlock[]
  firstKey: string
  running: number
  errors: number
  completed: number
  hasFollowingText: boolean
}

function isActivity(node: ChatConversationViewNode | undefined): node is ActivityNode {
  return node?.visibility === 'visible' && (node.kind === 'tool-call' || node.kind === 'command')
}
function isTool(node: ActivityNode): node is ToolNode {
  return node.kind === 'tool-call' && Boolean(node.data && node.data.root)
}
function turnOf(node: ChatConversationViewNode | undefined): number | undefined {
  const location = (node as any)?.location
  return location?.kind === 'step' || location?.kind === 'turn' ? location?.turn?.turn : undefined
}
function collectActivityGroup(snapshot: ConversationSnapshot, current: ActivityNode): ActivityGroup {
  const order = snapshot.chat.order
  const index = order.indexOf(current.key)
  const targetTurn = turnOf(current)
  if (index < 0 || targetTurn === undefined) return summarize([current])
  let start = index
  while (start > 0) {
    const previous = snapshot.chat.nodes.get(order[start - 1])
    if (!isActivity(previous) || turnOf(previous) !== targetTurn) break
    start--
  }
  const nodes: ActivityNode[] = []
  for (let cursor = start; cursor < order.length; cursor++) {
    const candidate = snapshot.chat.nodes.get(order[cursor])
    if (!isActivity(candidate) || turnOf(candidate) !== targetTurn) break
    if (!nodes.some((item) => item.key === candidate.key)) nodes.push(candidate)
  }
  const following = order.slice(start + nodes.length).map((key) => snapshot.chat.nodes.get(key)).filter((node) => turnOf(node) === targetTurn)
  const hasFollowingText = following.some((node) => node?.kind === 'assistant-step' && Array.isArray((node as any).data?.blocks) && (node as any).data.blocks.some((block: any) => block.kind === 'text' && String(block.text ?? '').trim() !== ''))
  return summarize(nodes, hasFollowingText)
}
function summarize(nodes: readonly ActivityNode[], hasFollowingText = false): ActivityGroup {
  const tools = nodes.filter(isTool).flatMap((node) => flatten(node.data.root))
  const running = tools.filter((block) => !('kind' in block)).length + nodes.filter((node) => node.kind === 'command' && !node.data?.outcome).length
  const errors = tools.filter((block) => 'kind' in block && block.isError).length + nodes.filter((node) => node.kind === 'command' && node.data?.outcome?.kind === 'error').length
  const completed = tools.filter((block) => 'kind' in block && !block.isError).length + nodes.filter((node) => node.kind === 'command' && node.data?.outcome?.kind === 'success').length
  return { nodes, tools, firstKey: nodes[0]?.key ?? '', running, errors, completed, hasFollowingText }
}
function flatten(block: ToolCallBlock): ToolCallBlock[] { return [block, ...block.subCalls.flatMap(flatten)] }
function toolName(block: ToolCallBlock): string { return 'kind' in block ? block.call?.name ?? block.callId : block.name }
function toolArgs(block: ToolCallBlock): string {
  const raw = 'kind' in block ? block.call?.argsRaw : block.argsRaw
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
}
function duration(tools: readonly ToolCallBlock[]): string | null {
  const settled = tools.filter((block): block is Extract<ToolCallBlock, { kind: 'tool-result' }> => 'kind' in block)
  const starts = settled.map((block) => block.callTime).filter((time): time is number => time !== null)
  const ends = settled.map((block) => block.time)
  if (!starts.length || !ends.length) return null
  const ms = Math.max(...ends) - Math.min(...starts)
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`
}
function activityLabel(node: ActivityNode): string {
  if (node.kind === 'command') return node.data?.name ?? 'command'
  return 'tool-call'
}

function AssistantReasoning(props: { text: string; running: boolean }): React.ReactNode {
  const [expanded, setExpanded] = useState(false)
  const summary = props.running ? props.text.trimEnd().split('\n').at(-1) : props.text.trimStart().split('\n')[0]
  return <div className="dtf__reasoning" data-state={props.running ? 'running' : 'done'}>
    <button className="dtf__reasoningHeader" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><span>⌘ Think</span><span className="dtf__reasoningSummary">{summary}</span><span>{expanded ? '▾' : '▸'}</span></button>
    {expanded && <div className="dtf__reasoningBody">{props.text}</div>}
  </div>
}
function EmbeddedToolFlow(props: { blocks: readonly any[]; running: boolean; inspectCall?: (callId: string) => void }): React.ReactNode {
  const [manual, setManual] = useState<boolean | null>(null)
  const open = manual ?? props.running
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (props.running) setManual(null) }, [props.blocks.map((block) => block.callId).join('|'), props.running])
  useEffect(() => { if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight }, [open, props.blocks.length])
  return <section className="dtf dtf--embedded" data-running={props.running}>
    <button className="dtf__header" type="button" aria-expanded={open} onClick={() => setManual(!open)}>
      <span className="dtf__chevron" aria-hidden>{open ? '▾' : '▸'}</span>
      <span className="dtf__heading"><span className="dtf__title">{props.running ? '正在调用工具' : '已完成工具调用'} · {props.blocks.length} 项</span>{!open && <span className="dtf__tools">{props.blocks.map((block) => block.name).join(' · ')}</span>}</span>
      <span className="dtf__stats">{props.running ? '运行中' : '完成'}</span>
    </button>
    {open && <div className="dtf__body" ref={bodyRef}>{props.blocks.map((block) => <button className="dtf__embeddedTool" type="button" key={block.callId} onClick={() => props.inspectCall?.(block.callId)}><span className="dtf__dot" /><span className="dtf__content"><span className="dtf__name">{block.name}</span><span className="dtf__args">{block.argsRaw}</span></span><span className="dtf__state">{props.running ? '运行中' : '完成'}</span></button>)}</div>}
  </section>
}
function AssistantMixed(props: AssistantProps): React.ReactNode {
  const data = props.node.data
  const blocks = data.blocks ?? []
  const t = props.t ?? ((key: string) => key)
  const codeLabels = { copyLabel: t('copy'), copiedLabel: t('copied') }
  const imageLabels = { image: t('image.label'), open: t('image.openOriginal'), openNamed: (label: string) => t('image.openOriginalLabel', { label } as never), loading: t('image.loading'), loadFailed: t('image.loadFailed'), lightbox: { dialog: t('image.preview'), close: t('image.closePreview') } }
  const independentCallIds = props.useSession((snapshot) => {
    const ids = new Set<string>()
    for (const key of snapshot.chat.order) {
      const node = snapshot.chat.nodes.get(key)
      if (node?.kind === 'tool-call' && (node as any).data?.root?.callId) ids.add((node as any).data.root.callId)
    }
    return ids
  })
  const last = blocks.length - 1
  const rendered: React.ReactNode[] = []
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]
    if (block.kind === 'text') { if (String(block.text ?? '').trim() !== '') rendered.push(<MarkdownText key={index} text={block.text} streaming={data.status === 'running'} codeLabels={codeLabels} fileMentions={undefined} />) }
    else if (block.kind === 'reasoning') rendered.push(<AssistantReasoning key={index} text={block.text} running={data.status === 'running' && index === last} />)
    else if (block.kind === 'image') {
      const images = []
      while (index < blocks.length && blocks[index]?.kind === 'image') images.push(blocks[index++])
      index--
      rendered.push(<ImageGallery key={`images-${index}`} images={images} load={props.loadImage ?? (async () => '')} align="start" labels={imageLabels} />)
    } else if (block.kind === 'tool-call') {
      const toolBlocks = []
      while (index < blocks.length && blocks[index]?.kind === 'tool-call') {
        if (!independentCallIds.has(blocks[index].callId)) toolBlocks.push(blocks[index])
        index++
      }
      index--
      if (toolBlocks.length) rendered.push(<EmbeddedToolFlow key={`embedded-${toolBlocks[0]?.callId ?? index}`} blocks={toolBlocks} running={data.status === 'running'} inspectCall={props.inspectCall} />)
    }
  }
  for (const [index, block] of blocks.entries()) {
    if (block.kind === 'other') rendered.push(<JsonBlock key={`other-${index}`} label={t('message.unknownBlock')} payload={block.block} truncatedLabel={(total) => t('json.truncated', { total })} />)
  }
  if (data.status === 'interrupted') rendered.push(<span className="dtf__interrupted" key="interrupted">{t('message.stopped')}</span>)
  if (rendered.length === 0) return null
  return <div className="dtf__assistant">{rendered}</div>
}

function ActivityFlow(props: ActivityProps): React.ReactNode {
  const current = props.node as ActivityNode
  const group = props.useSession((snapshot) => collectActivityGroup(snapshot, current))
  if (current.key !== group.firstKey) return null
  const [manual, setManual] = useState<boolean | null>(null)
  const sessionRunning = props.useSession((snapshot) => snapshot.running)
  const open = manual ?? (group.running > 0 || sessionRunning && !group.hasFollowingText)
  const bodyRef = useRef<HTMLDivElement>(null)
  const signature = group.nodes.map((node) => node.key).join('|')
  useEffect(() => {
    if (group.running > 0 || sessionRunning && !group.hasFollowingText) setManual(null)
    else if (manual === null) setManual(false)
  }, [signature, group.running, group.hasFollowingText, sessionRunning])
  useEffect(() => { if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight }, [open, group.nodes.length, group.tools.length])
  const counts = useMemo(() => {
    const values = group.nodes.flatMap((node) => isTool(node) ? [toolName(node.data.root)] : [activityLabel(node)])
    const map = new Map<string, number>()
    for (const value of values) map.set(value, (map.get(value) ?? 0) + 1)
    return [...map.entries()].map(([name, count]) => count > 1 ? `${name} ×${count}` : name).join(' · ')
  }, [group.nodes])
  const elapsed = duration(group.tools)
  const title = group.running ? `正在处理 · ${group.nodes.length} 项` : `已完成处理 · ${group.nodes.length} 项`
  const stats = [group.completed ? `${group.completed} 完成` : '', group.running ? `${group.running} 运行中` : '', group.errors ? `${group.errors} 失败` : '', elapsed].filter(Boolean).join(' · ')
  return <section className="dtf" data-running={group.running > 0} data-error={group.errors > 0}>
    <button className="dtf__header" type="button" aria-expanded={open} onClick={() => setManual(!open)}>
      <span className="dtf__chevron" aria-hidden>{open ? '▾' : '▸'}</span>
      <span className="dtf__heading"><span className="dtf__title">{title}</span>{!open && <span className="dtf__tools">{counts}</span>}</span>
      <span className="dtf__stats">{stats}</span>
    </button>
    {open && <div className="dtf__body" ref={bodyRef}>
      {group.nodes.flatMap((node) => isTool(node) ? flatten(node.data.root).map((block, index) => {
        const state = !('kind' in block) ? 'running' : block.isError ? 'error' : 'done'
        const native = props.renderSlot && props.openFile && props.inspectCall ? props.renderSlot('tool.call.toolview', { callId: block.callId, toolName: toolName(block), block, cwd: props.cwd, openFile: props.openFile, inspect: () => props.inspectCall?.(block.callId) }) : null
        return <div className="dtf__row" data-state={state} key={`${block.callId}:${index}`}><button className="dtf__summary" type="button" onClick={() => props.inspectCall?.(block.callId)}><span className="dtf__dot" /><span className="dtf__content"><span className="dtf__name">{toolName(block)}</span>{toolArgs(block) && <span className="dtf__args">{toolArgs(block)}</span>}</span><span className="dtf__state">{state === 'running' ? '运行中' : state === 'error' ? '失败' : '完成'}</span></button><div className="dtf__native">{native}</div></div>
      }) : [<div className="dtf__row" data-state={node.kind === 'command' && node.data?.outcome?.kind === 'error' ? 'error' : node.kind === 'command' && !node.data?.outcome ? 'running' : 'done'} key={node.key}><button className="dtf__summary" type="button"><span className="dtf__dot" /><span className="dtf__content"><span className="dtf__name">{activityLabel(node)}</span><span className="dtf__args">{node.kind === 'command' ? node.data?.args : '处理中间步骤'}</span></span><span className="dtf__state">{node.kind === 'command' && !node.data?.outcome ? '运行中' : '完成'}</span></button></div>])}
    </div>}
  </section>
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => { const tag = document.createElement('style'); tag.dataset.plugin = 'dsh-tool-flow'; tag.textContent = css; document.head.appendChild(tag); return () => tag.remove() }, 'dsh-tool-flow: styles')
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'tool-call', priority: -1, locale: 'conversation', inject: undefined }, ActivityFlow as never))
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'command', priority: -1, locale: 'conversation', inject: undefined }, ActivityFlow as never))
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'assistant-step', priority: -1, locale: 'conversation', inject: undefined }, AssistantMixed as never))
}
