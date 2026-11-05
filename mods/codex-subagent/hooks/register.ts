import type { EngineInterface, Register, TurnStepInput } from 'claude-code'

import { type Item, NAME, PREFIX, storeStep } from './steps'

type Model = { id: string; hidden: boolean; description: string; supportedReasoningEfforts: { reasoningEffort: string }[] }
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
type Turn = { id: string; status: 'completed' | 'interrupted' | 'failed'; items: { type: string; text?: string }[]; error: { message: string } | null }
type CodexMessage = { id?: number | string; method?: string; params?: { threadId?: string; turn?: Turn; item?: Item } }

const TOOL = `mcp__${NAME}__codex`
const HANDBACK = 'SubagentHandback'

let socket: string | undefined
let settingUp: Promise<void> | undefined
const modelOfType = new Map<string, Model>()
// One thread per subagent, so a subagent resumed by SendMessage goes on in the same codex conversation.
const threadOfAgent = new Map<string, string>()
const agentOfThread = new Map<string, string>()
// Messages a running subagent got, sent to codex as one more turn before the handback.
const heldMessagesOfAgent = new Map<string, string[]>()
// Keyed by turn id: the relay hands each event out once, so a call can poll another call's turn/completed.
const completedTurns = new Map<string, Turn>()

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

// max is the model's top; a step the model lacks falls to the nearest one below it, and none below leaves the model's default.
function codexEffort(model: Model, effort: Effort | undefined) {
  const supported = model.supportedReasoningEfforts.map(e => e.reasoningEffort)
  if (effort === 'max') return supported.at(-1)
  if (!effort) return undefined
  return EFFORTS.slice(0, EFFORTS.indexOf(effort) + 1).findLast(step => supported.includes(step))
}

function lastAnswer(turn: Turn) {
  return turn.items.findLast(item => item.type === 'agentMessage')?.text ?? ''
}

async function take($: EngineInterface, message: CodexMessage) {
  // approvalPolicy "never" keeps codex from asking, so any request is one this mod cannot answer; leaving it would stall the turn.
  if (message.id !== undefined && message.method) {
    await fetchRelay($, '/send', { id: message.id, error: { code: -32601, message: `${NAME} does not handle ${message.method}` } })
    return
  }
  const { threadId, turn, item } = message.params ?? {}
  // A thread this mod did not start is a nested codex subagent's, whose turns codex's own parent thread waits for.
  const agentId = threadId ? agentOfThread.get(threadId) : undefined
  if (!agentId) return
  if (item && (message.method === 'item/started' || message.method === 'item/completed')) await storeStep($, agentId, item)
  if (message.method === 'turn/completed' && turn) completedTurns.set(turn.id, turn)
}

// Each call polls for itself, since a hook's wait counts against its 10-second budget unless it waits on a $ call.
async function waitTurn($: EngineInterface, turnId: string, signal: AbortSignal) {
  while (!signal.aborted) {
    const turn = completedTurns.get(turnId)
    if (turn) {
      completedTurns.delete(turnId)
      return turn
    }
    const { events } = await fetchRelay($, '/events')
    for (const message of events) await take($, message)
  }
  throw new Error('the codex turn was interrupted')
}

async function threadFor($: EngineInterface, agentId: string, model: Model) {
  const known = threadOfAgent.get(agentId)
  if (known) return known
  const { thread } = await rpc($, 'thread/start', {
    model: model.id,
    cwd: await $.session.cwd(),
    approvalPolicy: 'never',
    sandbox: 'workspace-write',
    config: { 'sandbox_workspace_write.network_access': true },
    ephemeral: false,
  })
  threadOfAgent.set(agentId, thread.id)
  agentOfThread.set(thread.id, agentId)
  return thread.id as string
}

async function runCodex($: EngineInterface, model: Model, agentId: string, prompt: string, signal: AbortSignal) {
  const threadId = await threadFor($, agentId, model)
  const started: Promise<{ turn: Turn }> = rpc($, 'turn/start', { threadId, input: textInput(prompt) })
  // TaskStop abandons this call; codex would otherwise run the turn on to its end.
  signal.addEventListener('abort', () => void started.then(({ turn }) => rpc($, 'turn/interrupt', { threadId, turnId: turn.id })).catch(() => {}))
  const turn = await waitTurn($, (await started).turn.id, signal)
  if (turn.status === 'completed') return { result: lastAnswer(turn) }
  return { deny: turn.error?.message ?? `the codex turn ${turn.status === 'failed' ? 'failed' : 'was interrupted'}` }
}

async function modelOfAgent($: EngineInterface, agentId: string | undefined) {
  if (agentId === undefined) return undefined
  const type = (await $.agent.list()).find(agent => agent.id === agentId)?.type
  return type ? modelOfType.get(type) : undefined
}

// The engine runs the tool calls a step lists, so a step that only yields one is enough to make it call the tool.
async function* callTool(e: TurnStepInput, name: string, input: Record<string, unknown>) {
  yield { kind: 'tool' as const, index: 0, id: `toolu_codex_${crypto.randomUUID().replaceAll('-', '')}`, name }
  yield { kind: 'input' as const, index: 0, json: JSON.stringify(input) }
  yield { kind: 'stop' as const, stopReason: 'tool_use' as const, usage: null }
  return { turnId: e.turnId, index: e.index, answer: '', toolUses: [{ name, input }], stopReason: 'tool_use' as const, usage: null }
}

async function* endTurn(e: TurnStepInput) {
  yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage: null }
  return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
}

async function setUp($: EngineInterface) {
  socket = await startRelay($)
  if (!socket) return
  const { version } = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`))
  await rpc($, 'initialize', { clientInfo: { name: NAME, title: null, version }, capabilities: { experimentalApi: true } })
  await fetchRelay($, '/send', { method: 'initialized' })
  await $.tool.register({
    name: 'codex',
    description: `Runs a task on codex and answers with codex's last message. Only ${PREFIX}* subagents can call it.`,
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] },
    isDeferred: false,
  })
  for (const model of await listModels($)) {
    const name = model.id.replaceAll('.', '-')
    modelOfType.set(`${PREFIX}${name}`, model)
    await $.agent.register({
      name,
      description: `Delegates to \`${model.id}\`. ${model.description}`,
      prompt: `You are ${model.id} running on codex.`,
      tools: [TOOL, HANDBACK],
    })
  }
}

// The real Agent tool says to set effort only when asked, which would leave every codex run at the model's default.
const EFFORT_RULE = ` For a ${PREFIX}* subagent_type, you may choose \`effort\` yourself to fit how hard the task is.`

export const register: Register = on => {
  on('tool.describe', { tool: 'Agent' }, async (_, e, next) => {
    const described = await next(e)
    return modelOfType.size ? { ...described, description: described.description + EFFORT_RULE } : described
  })

  // Answered here, never by the model: the codex subagent's steps are codex's work, and Claude only carries the answer back.
  on('turn.step', async function* ($, e, next) {
    if (!(await modelOfAgent($, e.agentId))) return yield* next(e)
    const rows = await $.session.messages({ agentId: e.agentId })
    if (!Array.isArray(rows)) return yield* next(e)
    const last = rows.at(-1)
    const answered = last?.role === 'user' ? last.toolResults?.at(-1) : undefined
    if (!answered) return yield* callTool(e, TOOL, { prompt: last?.text ?? '' })
    const tool = rows.at(-2)?.toolUses.find(use => use.tool_use_id === answered.tool_use_id)?.tool
    // A text answer would not end the run: Claude Code asks for SubagentHandback and steps again.
    if (tool !== TOOL) return yield* endTurn(e)
    const held = heldMessagesOfAgent.get(e.agentId!)
    heldMessagesOfAgent.delete(e.agentId!)
    if (held) return yield* callTool(e, TOOL, { prompt: held.join('\n\n') })
    return yield* callTool(e, HANDBACK, { message: answered.isError ? `codex failed: ${answered.text}` : answered.text })
  })

  // Never passed on: core would put the call to auto mode's check, which has no verdict for a step the model did not take, and refuse it.
  on('tool.call', { tool: 'mcp__codex-subagent__codex' }, async ($, e, next) => {
    try {
      const model = await modelOfAgent($, e.agentId)
      if (!model || !e.agentId) return { deny: `${TOOL} runs only inside a ${PREFIX}* subagent.` }
      return await runCodex($, model, e.agentId, String(e.prompt ?? ''), next.signal)
    } catch (error) {
      return { deny: messageOf(error) }
    }
  }).catch(() => ({ deny: `${NAME}: the codex tool stopped before codex answered.` }))

  // A running subagent's message reaches here only after the codex tool returned, so it cannot steer that turn;
  // queued, it would sit behind the tool's result, which the handback step never reads.
  // A finished subagent's message is passed on, since Claude Code resumes the subagent with it.
  on('session.receive', async ($, e, next) => {
    const agent = (await $.agent.list()).find(agent => agent.id === e.agentId)
    if (!agent || !modelOfType.has(agent.type) || (agent.status !== 'pending' && agent.status !== 'running')) return next(e)
    heldMessagesOfAgent.set(agent.id, [...(heldMessagesOfAgent.get(agent.id) ?? []), e.text])
    return { consumed: `${NAME}: held for one more codex turn` }
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
