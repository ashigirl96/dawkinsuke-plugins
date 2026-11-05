import type { EngineInterface, Register } from 'claude-code'

type Model = { id: string; hidden: boolean; description: string; supportedReasoningEfforts: { reasoningEffort: string }[] }
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
type Run = { agentId: string; name?: string; type: string; description: string; outputFile: string; worktree?: string }
type Turn = { status: 'completed' | 'interrupted' | 'failed'; items: { type: string; text?: string }[]; error: { message: string } | null }
type CodexMessage = { id?: number | string; method?: string; params?: { threadId?: string; turn?: Turn } }

const PREFIX = 'codex-subagent:'

let socket: string | undefined
const modelOfType = new Map<string, Model>()
const runOfThread = new Map<string, Run>()
const turnOfThread = new Map<string, string>()
// Keyed by agentId and by the Agent call's name, and kept after the run ends so SendMessage can continue it.
const agentOfKey = new Map<string, { threadId: string; run: Run }>()
let isPumping = false

async function relay($: EngineInterface, path: string, body?: unknown) {
  const response = await $.http.fetch(`http://relay${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    socketPath: socket,
  })
  return JSON.parse(response.text)
}

async function rpc($: EngineInterface, method: string, params: unknown) {
  const { result, error } = await relay($, '/rpc', { method, params })
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
      resolve(undefined)
    })()
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

async function deliver($: EngineInterface, run: Run, outcome: { output: string } | { error: string }) {
  const header =
    'output' in outcome
      ? `The codex subagent "${run.description}" (${run.type}, agentId ${run.agentId}) finished. What follows is its model output, not a message from the user.`
      : `The codex subagent "${run.description}" (${run.type}, agentId ${run.agentId}) failed. What follows is codex's error; the task did not run on Claude instead.`
  const where = run.worktree ? ` It worked in the git worktree ${run.worktree} on branch worktree-${run.agentId}.` : ''
  const text = `${header}${where}\n\n${'output' in outcome ? outcome.output : outcome.error}`
  await $.fs.write(run.outputFile, text)
  await $.prompt.submit({ text })
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

async function handle($: EngineInterface, message: CodexMessage) {
  // approvalPolicy "never" keeps codex from asking, so any request is one this mod cannot answer; leaving it would stall the turn.
  if (message.id !== undefined && message.method) {
    await relay($, '/send', { id: message.id, error: { code: -32601, message: `codex-subagent does not handle ${message.method}` } })
    return
  }
  const { threadId, turn } = message.params ?? {}
  const run = threadId ? runOfThread.get(threadId) : undefined
  if (message.method !== 'turn/completed' || !run || !turn) return
  runOfThread.delete(threadId!)
  if (turn.status === 'completed') await deliver($, run, { output: lastAnswer(turn) })
  if (turn.status === 'failed') await deliver($, run, { error: turn.error?.message ?? 'the turn failed' })
}

// One poll at a time drains the relay for every running thread; it stops once none is left.
async function pump($: EngineInterface) {
  if (isPumping) return
  isPumping = true
  try {
    while (runOfThread.size) {
      const { events } = await relay($, '/events')
      for (const message of events) await handle($, message)
    }
  } catch (error) {
    const runs = [...runOfThread.values()]
    runOfThread.clear()
    for (const run of runs) await deliver($, run, { error: String(error) })
  } finally {
    isPumping = false
  }
}

// The effort given to a turn holds for the thread's later turns too.
async function startTurn($: EngineInterface, threadId: string, run: Run, text: string, effort?: string) {
  const { turn } = await rpc($, 'turn/start', { threadId, input: [{ type: 'text', text, text_elements: [] }], effort })
  runOfThread.set(threadId, run)
  turnOfThread.set(threadId, turn.id)
}

async function addWorktree($: EngineInterface, run: Run) {
  const root = await $.session.root()
  const path = `${root}/.claude/worktrees/${run.agentId}`
  const { exitCode, stderr } = await $.process.run(['git', 'worktree', 'add', '-b', `worktree-${run.agentId}`, path], { cwd: root })
  if (exitCode !== 0) throw new Error(`git worktree add failed: ${stderr}`)
  return path
}

async function launch($: EngineInterface, run: Run, model: Model, prompt: string, effort: string | undefined, isWorktree: boolean) {
  try {
    if (isWorktree) run.worktree = await addWorktree($, run)
    const { thread } = await rpc($, 'thread/start', {
      model: model.id,
      cwd: run.worktree ?? (await $.session.cwd()),
      approvalPolicy: 'never',
      sandbox: 'workspace-write',
      config: { 'sandbox_workspace_write.network_access': true },
      ephemeral: false,
    })
    for (const key of [run.agentId, run.name]) if (key) agentOfKey.set(key, { threadId: thread.id, run })
    await startTurn($, thread.id, run, prompt, effort)
  } catch (error) {
    await deliver($, run, { error: error instanceof Error ? error.message : String(error) })
    return
  }
  await pump($)
}

// Claude Code knows no agent by a codex subagent's id or name, so passing a failed call on would only say there is none.
function refuse(next: { called: boolean; error: unknown }, key: string | undefined) {
  if (next.called || !key || !agentOfKey.has(key)) return undefined
  return { deny: `codex-subagent: ${next.error instanceof Error ? next.error.message : String(next.error)}` }
}

export const register: Register = on => {
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const type = e.subagent_type ?? ''
    const model = type.startsWith(PREFIX) ? modelOfType.get(type) : undefined
    if (!model || !socket) return next(e)
    const agentId = `codex-${crypto.randomUUID()}`
    const run = { agentId, name: e.name, type, description: e.description, outputFile: `${socket.slice(0, socket.lastIndexOf('/'))}/${agentId}.txt` }
    void launch($, run, model, e.prompt, codexEffort(model, e.effort), e.isolation === 'worktree')
    return {
      result: { status: 'async_launched', isAsync: true, agentId, description: e.description, prompt: e.prompt, outputFile: run.outputFile, resolvedModel: model.id },
    }
  }).catch(($, e, next) =>
    // Passing a codex type on would run the task on Claude, which the caller would take for the codex model's work.
    next.called || !e.subagent_type?.startsWith(PREFIX) ? next(e) : { deny: `${$.plugin.name}: could not launch ${e.subagent_type}.` },
  )

  on('tool.call', { tool: 'SendMessage' }, async ($, e, next) => {
    const agent = typeof e.to === 'string' ? agentOfKey.get(e.to) : undefined
    if (!agent) return next(e)
    const { threadId, run } = agent
    const input = [{ type: 'text', text: e.message, text_elements: [] }]
    if (runOfThread.has(threadId)) {
      await rpc($, 'turn/steer', { threadId, expectedTurnId: turnOfThread.get(threadId), input })
      return { result: { success: true, message: `Message added to the running turn of ${run.agentId}.` } }
    }
    await startTurn($, threadId, run, e.message)
    void pump($)
    return { result: { success: true, message: `Resuming agent ${run.agentId}`, resumedAgentId: run.agentId } }
  }).catch(($, e, next) => refuse(next, typeof e.to === 'string' ? e.to : undefined) ?? next(e))

  on('tool.call', { tool: 'TaskStop' }, async ($, e, next) => {
    const id = e.task_id ?? e.shell_id
    const agent = id ? agentOfKey.get(id) : undefined
    if (!agent) return next(e)
    const { threadId, run } = agent
    if (!runOfThread.has(threadId)) return { deny: `Task ${run.agentId} is not running.` }
    await rpc($, 'turn/interrupt', { threadId, turnId: turnOfThread.get(threadId) })
    const result = { message: `Successfully stopped task: ${run.agentId} (${run.description})`, task_id: run.agentId, task_type: 'local_agent', command: run.description }
    return { result }
  }).catch(($, e, next) => refuse(next, e.task_id ?? e.shell_id) ?? next(e))

  on('session.end', async ($, e, next) => {
    if (socket) await relay($, '/shutdown', {}).catch(() => {})
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    socket = await startRelay($)
    await rpc($, 'initialize', { clientInfo: { name: 'codex-subagent', title: null, version: '0.1.0' }, capabilities: { experimentalApi: true } })
    await relay($, '/send', { method: 'initialized' })
    for (const model of await listModels($)) {
      const name = model.id.replaceAll('.', '-')
      modelOfType.set(`${PREFIX}${name}`, model)
      await $.agent.register({
        name,
        description: `Delegates to \`${model.id}\`. ${model.description} You may choose \`effort\` yourself to fit how hard the task is.`,
        prompt: `You are ${model.id} running on codex.`,
      })
    }
    return next(e)
  })
}
