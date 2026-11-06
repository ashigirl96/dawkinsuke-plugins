import type { EngineInterface, Register, TurnStepInput } from 'claude-code'

import { childThreadOf, type Item, KINDS, kindOfItem, kindOfTool, NAME, oneLine, PREFIX, type RowInput } from './items'

type Model = { id: string; hidden: boolean; description: string; supportedReasoningEfforts: { reasoningEffort: string }[] }
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
type Turn = { id: string; status: 'completed' | 'interrupted' | 'failed'; error: { message: string } | null }
type CodexMessage = { id?: number | string; method?: string; params?: { threadId?: string; turn?: Turn; item?: Item } }
type CodexAgent = { model: Model; type: string }

const HANDBACK = 'SubagentHandback'
const CHILD_PROMPT = /^codex child thread (\S+)/
// What Claude Code wakes a finished parent with once a background subagent it started has handed back.
const CHILD_NOTICE = /^<agent-message from="(\w+)">|^<task-notification>\s*<task-id>(\w+)<\/task-id>/

let socket: string | undefined
let settingUp: Promise<void> | undefined
const modelOfType = new Map<string, Model>()
// One thread per subagent, so a subagent resumed by SendMessage goes on in the same codex conversation.
const threadOfAgent = new Map<string, string>()
const agentOfThread = new Map<string, string>()
const runningTurnOfAgent = new Map<string, string>()
// A codex child's turn starts before its subagent is bound, and the mod never calls turn/start for it.
const startedTurnOfThread = new Map<string, string>()
// The relay hands each notification out once, so whichever hook polled it files it under its thread: a codex child's come before its subagent exists.
const eventsOfThread = new Map<string, CodexMessage[]>()
const endedThreads = new Set<string>()
// The codex children this mod made an Agent call for, so only those calls are allowed and only their subagents skip turn/start.
const childThreads = new Set<string>()
const childAgents = new Set<string>()
const completedItems = new Map<string, Item>()
const heldMessagesOfAgent = new Map<string, string[]>()
// agent.spawn carries no effort, so the Agent call's is kept under its tool_use_id until the spawn names the subagent.
const effortOfCall = new Map<string, Effort>()
const effortOfAgent = new Map<string, Effort>()

const textInput = (text: string) => [{ type: 'text', text, text_elements: [] }]
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function fetchRelay($: EngineInterface, path: string, body?: unknown) {
  // Without socketPath, $.http.fetch would send this to a host named relay over TCP.
  if (!socket) throw new Error('the codex relay is not running')
  const response = await $.http.fetch(`http://relay${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    socketPath: socket,
  })
  return JSON.parse(response.text)
}

async function rpc($: EngineInterface, method: string, params: unknown) {
  const { result, error } = await fetchRelay($, '/rpc', { method, params })
  if (error) throw new Error(error.message)
  return result
}

function startRelay($: EngineInterface) {
  return new Promise<string | undefined>(resolve => {
    void (async () => {
      let stdout = ''
      let isAnnounced = false
      // The relay lives as long as this loop reads it, so it keeps reading after the socket line.
      for await (const chunk of $.process.spawn({ argv: ['bun', `${$.plugin.root}/relay/relay.ts`] })) {
        if (!('text' in chunk) || chunk.stream !== 'stdout' || isAnnounced) continue
        stdout += chunk.text
        const end = stdout.indexOf('\n')
        if (end < 0) continue
        isAnnounced = true
        resolve(JSON.parse(stdout.slice(0, end)).socket)
      }
    })()
      .catch(() => {})
      .finally(() => resolve(undefined))
  })
}

async function listModels($: EngineInterface) {
  const models: Model[] = []
  let cursor: string | null = null
  do {
    const page: { data: Model[]; nextCursor: string | null } = await rpc($, 'model/list', { cursor })
    models.push(...page.data)
    cursor = page.nextCursor
  } while (cursor)
  return models.filter(model => !model.hidden)
}

const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

function codexEffort(model: Model, effort: Effort | undefined) {
  const supported = model.supportedReasoningEfforts.map(e => e.reasoningEffort)
  if (effort === 'max') return supported.at(-1)
  if (!effort) return undefined
  return EFFORTS.slice(0, EFFORTS.indexOf(effort) + 1).findLast(step => supported.includes(step))
}

// Hooks wait on the relay only: a hook's wait counts against its 10-second budget unless it waits on a $ call.
async function poll($: EngineInterface) {
  const { events }: { events: CodexMessage[] } = await fetchRelay($, '/events')
  for (const message of events) {
    // approvalPolicy "never" keeps codex from asking, so any request is one this mod cannot answer; leaving it would stall the turn.
    if (message.id !== undefined && message.method) {
      await fetchRelay($, '/send', { id: message.id, error: { code: -32601, message: `${NAME} does not handle ${message.method}` } })
      continue
    }
    const { threadId, turn, item } = message.params ?? {}
    if (!threadId) continue
    const isStep =
      (message.method === 'item/started' && item && kindOfItem(item)) ||
      (message.method === 'item/completed' && item?.type === 'agentMessage') ||
      (item && childThreadOf(item)) ||
      message.method === 'turn/completed'
    if (isStep) eventsOfThread.set(threadId, [...(eventsOfThread.get(threadId) ?? []), message])
    if (message.method === 'item/completed' && item && kindOfItem(item)) completedItems.set(item.id, item)
    const agentId = agentOfThread.get(threadId)
    if (message.method === 'turn/started' && turn?.id) {
      startedTurnOfThread.set(threadId, turn.id)
      if (agentId) runningTurnOfAgent.set(agentId, turn.id)
    }
    if (message.method !== 'turn/completed') continue
    endedThreads.add(threadId)
    if (startedTurnOfThread.get(threadId) === turn?.id) startedTurnOfThread.delete(threadId)
    if (agentId && runningTurnOfAgent.get(agentId) === turn?.id) runningTurnOfAgent.delete(agentId)
  }
}

// TaskStop abandons the step or tool call that waits on codex; codex would otherwise run the turn on to its end.
function interruptOnAbort($: EngineInterface, agentId: string, signal: AbortSignal) {
  signal.addEventListener('abort', () => {
    const turnId = runningTurnOfAgent.get(agentId)
    if (turnId) void rpc($, 'turn/interrupt', { threadId: threadOfAgent.get(agentId), turnId }).catch(() => {})
  })
}

function bind(agentId: string, threadId: string) {
  threadOfAgent.set(agentId, threadId)
  agentOfThread.set(threadId, agentId)
  const started = startedTurnOfThread.get(threadId)
  if (started) runningTurnOfAgent.set(agentId, started)
}

const isChildNotice = (text: string) => childAgents.has(text.match(CHILD_NOTICE)?.slice(1).find(Boolean) ?? '')

const childThreadIn = (text: unknown) => {
  const threadId = typeof text === 'string' ? text.match(CHILD_PROMPT)?.[1] : undefined
  return threadId && childThreads.has(threadId) ? threadId : undefined
}

// A TaskStop that lands before codex names the turn finds nothing to interrupt, so the start checks the signal itself.
async function startTurn($: EngineInterface, agentId: string, model: Model, prompt: string, signal: AbortSignal) {
  let threadId = threadOfAgent.get(agentId)
  if (!threadId) {
    const { thread } = await rpc($, 'thread/start', {
      model: model.id,
      cwd: await $.session.cwd(),
      approvalPolicy: 'never',
      sandbox: 'workspace-write',
      config: { 'sandbox_workspace_write.network_access': true },
      ephemeral: false,
    })
    threadId = thread.id as string
    bind(agentId, threadId)
  }
  signal.throwIfAborted()
  endedThreads.delete(threadId)
  const { turn } = await rpc($, 'turn/start', { threadId, input: textInput(prompt), effort: codexEffort(model, effortOfAgent.get(agentId)) })
  runningTurnOfAgent.set(agentId, turn.id)
  if (signal.aborted) {
    void rpc($, 'turn/interrupt', { threadId, turnId: turn.id }).catch(() => {})
    signal.throwIfAborted()
  }
}

const hold = (agentId: string, text: string) => heldMessagesOfAgent.set(agentId, [...(heldMessagesOfAgent.get(agentId) ?? []), text])

function takeHeld(agentId: string) {
  const held = heldMessagesOfAgent.get(agentId)
  heldMessagesOfAgent.delete(agentId)
  return held?.join('\n\n')
}

async function nextStep($: EngineInterface, agentId: string, { model, type }: CodexAgent, signal: AbortSignal) {
  const said: string[] = []
  const withText = (name: string, input: Record<string, unknown>) => ({ text: said.join('\n\n'), name, input })
  for (;;) {
    const threadId = threadOfAgent.get(agentId) ?? ''
    const message = eventsOfThread.get(threadId)?.shift()
    if (!message) {
      if (signal.aborted) throw new Error('the codex turn was interrupted')
      // A codex child's turn was started by codex, so only its thread's end says it stopped.
      const isRunning = childAgents.has(agentId) ? !endedThreads.has(threadId) : runningTurnOfAgent.has(agentId)
      if (!isRunning) throw new Error('no codex turn is running for this subagent')
      await poll($)
      continue
    }
    const { item, turn } = message.params ?? {}
    const child = item && childThreadOf(item)
    // An Agent call from this subagent's own loop is what makes Claude Code nest the child under it; $.agent.spawn puts it beside.
    if (child && !childThreads.has(child)) {
      childThreads.add(child)
      const path = item.agentPath ?? ''
      return withText('Agent', {
        subagent_type: type,
        description: `codex ${path.split('/').at(-1) || 'child'}`,
        prompt: `codex child thread ${child}\n\n${path}`,
        run_in_background: true,
      })
    }
    if (message.method === 'item/completed' && item?.text) said.push(item.text)
    const kind = message.method === 'item/started' && item ? kindOfItem(item) : undefined
    if (kind && item) return withText(kind.tool, { ...kind.inputOf(item, await $.session.cwd()), item_id: item.id })
    if (message.method !== 'turn/completed' || !turn) continue
    const held = takeHeld(agentId)
    if (held) {
      await startTurn($, agentId, model, held, signal)
      continue
    }
    if (turn.status !== 'completed') {
      return withText(HANDBACK, { message: `codex failed: ${turn.error?.message ?? `the codex turn ${turn.status === 'failed' ? 'failed' : 'was interrupted'}`}` })
    }
    const answer = said.pop() ?? ''
    return withText(HANDBACK, { message: answer })
  }
}

// Claude Code hands a parent its child's result only at a tool round of the parent's other than the handback.
async function childEnded($: EngineInterface, threadId: string) {
  // shortcut: gives up after 8 s, inside the hook's 10-second budget that $.clock.sleep counts against; wait on an agent event if one ever says a subagent ended.
  for (let tries = 0; tries < 80; tries++) {
    const agentId = agentOfThread.get(threadId)
    const agent = agentId && (await $.agent.list()).find(agent => agent.id === agentId)
    if (agent && !['pending', 'running', 'waiting'].includes(agent.status)) return
    await $.clock.sleep(100)
  }
}

async function codexAgentOf($: EngineInterface, agentId: string | undefined) {
  if (agentId === undefined) return undefined
  const agent = (await $.agent.list()).find(agent => agent.id === agentId)
  const model = agent && modelOfType.get(agent.type)
  return model && { model, type: agent.type, status: agent.status }
}

// The engine runs the tool calls a step lists, so a step that only yields one is enough to make it call the tool.
async function* callTool(e: TurnStepInput, { text, name, input }: { text: string; name: string; input: Record<string, unknown> }) {
  const index = text ? 1 : 0
  if (text) yield { kind: 'text' as const, index: 0, text }
  yield { kind: 'tool' as const, index, id: `toolu_codex_${crypto.randomUUID().replaceAll('-', '')}`, name }
  yield { kind: 'input' as const, index, json: JSON.stringify(input) }
  yield { kind: 'stop' as const, stopReason: 'tool_use' as const, usage: null }
  return { turnId: e.turnId, index: e.index, answer: text, toolUses: [{ name, input }], stopReason: 'tool_use' as const, usage: null }
}

async function* endTurn(e: TurnStepInput) {
  yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage: null }
  return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
}

const itemSchema = (input: readonly string[]) => {
  const required = [...input, 'item_id']
  return { type: 'object' as const, properties: Object.fromEntries(required.map(key => [key, { type: 'string' as const }])), required }
}

async function setUp($: EngineInterface) {
  socket = await startRelay($)
  if (!socket) return
  const { version } = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`))
  let models: Model[]
  try {
    await rpc($, 'initialize', { clientInfo: { name: NAME, title: null, version }, capabilities: { experimentalApi: true } })
    await fetchRelay($, '/send', { method: 'initialized' })
    models = await listModels($)
  } catch {
    return
  }
  for (const kind of KINDS) {
    await $.tool.register({
      name: kind.name,
      description: `${kind.description} Only ${PREFIX}* subagents can call it.`,
      inputSchema: itemSchema(kind.input),
      isDeferred: false,
    })
  }
  for (const model of models) {
    const name = model.id.replaceAll('.', '-')
    modelOfType.set(`${PREFIX}${name}`, model)
    await $.agent.register({
      name,
      description: `Delegates to \`${model.id}\`. ${model.description}`,
      prompt: `You are ${model.id} running on codex.`,
      tools: [...KINDS.map(kind => kind.tool), 'Agent', HANDBACK],
    })
  }
}

export const register: Register = on => {
  // Answered here, never by the model: each step is something codex already started or saw end, and the last carries codex's answer back.
  on('turn.step', async function* ($, e, next) {
    const agent = await codexAgentOf($, e.agentId)
    if (!agent || !e.agentId) return yield* next(e)
    const agentId = e.agentId
    const rows = await $.session.messages({ agentId })
    if (!Array.isArray(rows)) return yield* next(e)
    const last = rows.at(-1)
    const answered = last?.role === 'user' ? last.toolResults?.at(-1) : undefined
    const tool = answered && rows.at(-2)?.toolUses.find(use => use.tool_use_id === answered.tool_use_id)?.tool
    const held = tool === HANDBACK ? takeHeld(agentId) : undefined
    // A text answer would not end the run: Claude Code asks for SubagentHandback and steps again.
    if (tool === HANDBACK && !held) return yield* endTurn(e)
    interruptOnAbort($, agentId, next.signal)
    try {
      const child = !answered && !threadOfAgent.has(agentId) ? childThreadIn(last?.text) : undefined
      if (child) {
        bind(agentId, child)
        childAgents.add(agentId)
      } else if (held || !answered) await startTurn($, agentId, agent.model, held ?? last?.text ?? '', next.signal)
      return yield* callTool(e, await nextStep($, agentId, agent, next.signal))
    } catch (error) {
      return yield* callTool(e, { text: '', name: HANDBACK, input: { message: `codex failed: ${messageOf(error)}` } })
    }
  })

  on('tool.call', { tool: 'Agent' }, ($, e, next) => {
    if (typeof e.effort === 'string' && String(e.subagent_type).startsWith(PREFIX)) effortOfCall.set(e.tool_use_id, e.effort as Effort)
    return next(e)
  })

  // auto mode's check has no verdict for a call the model did not make; codex's sandbox still holds what the child runs.
  on('tool.check', { tool: 'Agent' }, async ($, e, next) => {
    const threadId = childThreadIn((e.input as { prompt?: unknown }).prompt)
    if (threadId && !agentOfThread.has(threadId) && (await codexAgentOf($, e.agentId))) {
      return { decision: 'allow' as const, reason: `${NAME}: the subagent that shows codex child thread ${threadId}` }
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    // codex already gave the child's answer to its parent thread, so the wake would only start a paid codex turn.
    if (e.resume && isChildNotice(e.prompt)) return { deny: `${NAME}: codex already has the answer of its child` }
    const effort = effortOfCall.get(e.tool_use_id)
    effortOfCall.delete(e.tool_use_id)
    const spawned = await next(e)
    if (effort && 'agentId' in spawned && spawned.agentId) effortOfAgent.set(spawned.agentId, effort)
    return spawned
  })

  // Never passed on, since auto mode's check has no verdict for a step the model did not take and refuses it.
  for (const { tool, answerOf } of KINDS) {
    on('tool.call', { tool }, async ($, e, next) => {
      try {
        if (!e.agentId || !(await codexAgentOf($, e.agentId))) return { deny: `${tool} runs only inside a ${PREFIX}* subagent.` }
        interruptOnAbort($, e.agentId, next.signal)
        const id = String(e.item_id)
        while (!completedItems.has(id)) {
          if (next.signal.aborted) return { deny: 'the codex turn was interrupted' }
          await poll($)
        }
        const item = completedItems.get(id)!
        completedItems.delete(id)
        if (item.agentThreadId) await childEnded($, item.agentThreadId)
        return answerOf(item)
      } catch (error) {
        return { deny: messageOf(error) }
      }
    }).catch(() => ({ deny: `${NAME}: the item tool stopped before codex finished the item.` }))
  }

  // A plain props rewrite keeps the MCP spelling of the input, so the row is drawn whole, as Claude's Bash and Update rows look.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { tool, isRunning, isErrored } = e.props
    const kind = kindOfTool(tool)
    if (!kind) return next(e)
    const [name, argument] = kind.rowOf(e.props.input as RowInput)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text>
          {isRunning ? <Text dimColor>⏺ </Text> : <Text color={isErrored ? 'error' : 'success'}>⏺ </Text>}
          <Text bold>{name}</Text>
          {`(${oneLine(argument)})`}
        </Text>
        {isRunning ? <Text dimColor>{'  ⎿  Running…'}</Text> : null}
      </Box>
    )
  })

  // A finished subagent's message is passed on, since Claude Code resumes the subagent with it.
  on('session.receive', async ($, e, next) => {
    const agent = await codexAgentOf($, e.agentId)
    // codex already holds its child's answer; Claude Code still has to deliver the notice to close the parent's wait.
    if (!agent || !e.agentId || (agent.status !== 'pending' && agent.status !== 'running') || isChildNotice(e.text)) return next(e)
    const agentId = e.agentId
    const turnId = runningTurnOfAgent.get(agentId)
    if (turnId) {
      const steered = await rpc($, 'turn/steer', { threadId: threadOfAgent.get(agentId), input: textInput(e.text), expectedTurnId: turnId }).then(
        () => true,
        () => false,
      )
      if (steered) return { consumed: `${NAME}: added to the running codex turn` }
    }
    hold(agentId, e.text)
    return { consumed: `${NAME}: held for one more codex turn` }
  })

  // A message that waits for the handback skips session.receive: Claude Code writes it into the transcript as a hidden prompt row.
  on('session.append', async ($, e, next) => {
    const text = e.message.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('\n')
    if (e.agentId && e.door === 'prompt' && e.message.isMeta && !isChildNotice(text) && (await codexAgentOf($, e.agentId))) hold(e.agentId, text)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    // After /clear or /resume the process goes on and no session.start follows, so the relay must outlive the conversation.
    if (socket && e.reason !== 'clear' && e.reason !== 'resume') await fetchRelay($, '/shutdown', {}).catch(() => {})
    return next(e)
  })

  // A later session.start in the same worker (an enable, a respawn) reuses the relay, so running turns go on.
  on('session.start', async ($, e, next) => {
    settingUp ??= setUp($)
    await settingUp
    return next(e)
  })
}
