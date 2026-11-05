import type { EngineInterface, Register, TurnStepInput } from 'claude-code'

import { type Item, KINDS, kindOfItem, kindOfTool, NAME, oneLine, PREFIX, type RowInput } from './items'

type Model = { id: string; hidden: boolean; description: string; supportedReasoningEfforts: { reasoningEffort: string }[] }
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
type Turn = { id: string; status: 'completed' | 'interrupted' | 'failed'; error: { message: string } | null }
type CodexMessage = { id?: number | string; method?: string; params?: { threadId?: string; turn?: Turn; item?: Item } }

const HANDBACK = 'SubagentHandback'

let socket: string | undefined
let settingUp: Promise<void> | undefined
const modelOfType = new Map<string, Model>()
// One thread per subagent, so a subagent resumed by SendMessage goes on in the same codex conversation.
const threadOfAgent = new Map<string, string>()
const agentOfThread = new Map<string, string>()
const runningTurnOfAgent = new Map<string, string>()
// The relay hands each notification out once, so whichever hook polled it files it where its reader looks.
const eventsOfAgent = new Map<string, CodexMessage[]>()
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
    // A thread this mod did not start is a nested codex subagent's, whose turns codex's own parent thread waits for.
    const agentId = threadId ? agentOfThread.get(threadId) : undefined
    if (!agentId) continue
    const isStep =
      (message.method === 'item/started' && item && kindOfItem(item)) ||
      (message.method === 'item/completed' && item?.type === 'agentMessage') ||
      message.method === 'turn/completed'
    if (isStep) eventsOfAgent.set(agentId, [...(eventsOfAgent.get(agentId) ?? []), message])
    if (message.method === 'item/completed' && item && kindOfItem(item)) completedItems.set(item.id, item)
    if (message.method === 'turn/completed' && runningTurnOfAgent.get(agentId) === turn?.id) runningTurnOfAgent.delete(agentId)
  }
}

// TaskStop abandons the step or tool call that waits on codex; codex would otherwise run the turn on to its end.
function interruptOnAbort($: EngineInterface, agentId: string, signal: AbortSignal) {
  signal.addEventListener('abort', () => {
    const turnId = runningTurnOfAgent.get(agentId)
    if (turnId) void rpc($, 'turn/interrupt', { threadId: threadOfAgent.get(agentId), turnId }).catch(() => {})
  })
}

async function startTurn($: EngineInterface, agentId: string, model: Model, prompt: string) {
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
    threadOfAgent.set(agentId, threadId)
    agentOfThread.set(threadId, agentId)
  }
  const { turn } = await rpc($, 'turn/start', { threadId, input: textInput(prompt), effort: codexEffort(model, effortOfAgent.get(agentId)) })
  runningTurnOfAgent.set(agentId, turn.id)
}

const hold = (agentId: string, text: string) => heldMessagesOfAgent.set(agentId, [...(heldMessagesOfAgent.get(agentId) ?? []), text])

function takeHeld(agentId: string) {
  const held = heldMessagesOfAgent.get(agentId)
  heldMessagesOfAgent.delete(agentId)
  return held?.join('\n\n')
}

async function nextStep($: EngineInterface, agentId: string, model: Model, signal: AbortSignal) {
  const said: string[] = []
  const withText = (name: string, input: Record<string, unknown>) => ({ text: said.join('\n\n'), name, input })
  for (;;) {
    const message = eventsOfAgent.get(agentId)?.shift()
    if (!message) {
      if (signal.aborted) throw new Error('the codex turn was interrupted')
      if (!runningTurnOfAgent.has(agentId)) throw new Error('no codex turn is running for this subagent')
      await poll($)
      continue
    }
    const { item, turn } = message.params ?? {}
    if (message.method === 'item/completed' && item?.text) said.push(item.text)
    const kind = message.method === 'item/started' && item ? kindOfItem(item) : undefined
    if (kind && item) return withText(kind.tool, { ...kind.inputOf(item, await $.session.cwd()), item_id: item.id })
    if (message.method !== 'turn/completed' || !turn) continue
    const held = takeHeld(agentId)
    if (held) {
      await startTurn($, agentId, model, held)
      continue
    }
    if (turn.status !== 'completed') {
      return withText(HANDBACK, { message: `codex failed: ${turn.error?.message ?? `the codex turn ${turn.status === 'failed' ? 'failed' : 'was interrupted'}`}` })
    }
    const answer = said.pop() ?? ''
    return withText(HANDBACK, { message: answer })
  }
}

async function codexAgentOf($: EngineInterface, agentId: string | undefined) {
  if (agentId === undefined) return undefined
  const agent = (await $.agent.list()).find(agent => agent.id === agentId)
  const model = agent && modelOfType.get(agent.type)
  return model && { model, status: agent.status }
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
      tools: [...KINDS.map(kind => kind.tool), HANDBACK],
    })
  }
}

export const register: Register = on => {
  // Answered here, never by the model: each step is a command or file change codex already started, and the last carries codex's answer back.
  on('turn.step', async function* ($, e, next) {
    const model = (await codexAgentOf($, e.agentId))?.model
    if (!model || !e.agentId) return yield* next(e)
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
      if (held || !answered) await startTurn($, agentId, model, held ?? last?.text ?? '')
      return yield* callTool(e, await nextStep($, agentId, model, next.signal))
    } catch (error) {
      return yield* callTool(e, { text: '', name: HANDBACK, input: { message: `codex failed: ${messageOf(error)}` } })
    }
  })

  on('tool.call', { tool: 'Agent' }, ($, e, next) => {
    if (typeof e.effort === 'string' && String(e.subagent_type).startsWith(PREFIX)) effortOfCall.set(e.tool_use_id, e.effort as Effort)
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
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
    if (!agent || !e.agentId || (agent.status !== 'pending' && agent.status !== 'running')) return next(e)
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
    if (e.agentId && e.door === 'prompt' && e.message.isMeta && (await codexAgentOf($, e.agentId))) {
      hold(e.agentId, e.message.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('\n'))
    }
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
