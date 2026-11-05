import type { EngineInterface, Register } from 'claude-code'

import { type Item, NAME, PREFIX, registerSteps, storeStep } from './steps'

type Model = { id: string; hidden: boolean; description: string; supportedReasoningEfforts: { reasoningEffort: string }[] }
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
// turnId is set only while a turn runs; ready settles once the first turn has started or failed.
type Run = { agentId: string; name?: string; type: string; description: string; outputFile: string; output: string; worktree?: string; threadId?: string; turnId?: string; ready?: Promise<void> }
type Turn = { status: 'completed' | 'interrupted' | 'failed'; items: { type: string; text?: string }[]; error: { message: string } | null }
type CodexMessage = { id?: number | string; method?: string; params?: { threadId?: string; turn?: Turn; item?: Item } }

let socket: string | undefined
let settingUp: Promise<void> | undefined
const modelOfType = new Map<string, Model>()
// Keyed by agentId and by the Agent call's name, and kept after the run ends so SendMessage can continue it.
const runOfKey = new Map<string, Run>()
let isPumping = false

const runs = () => [...new Set(runOfKey.values())]
const runningOfThread = (threadId: string) => runs().find(run => run.turnId && run.threadId === threadId)
const textInput = (text: string) => [{ type: 'text', text, text_elements: [] }]
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))
const recipientOf = (e: { to?: unknown }) => (typeof e.to === 'string' ? e.to : undefined)
const taskOf = (e: { task_id?: string; shell_id?: string }) => e.task_id ?? e.shell_id

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

async function appendOutput($: EngineInterface, run: Run, text: string) {
  run.output += text
  await $.fs.write(run.outputFile, run.output)
}

const OPEN = '<codex-output>'
const CLOSE = '</codex-output>'
const HEADER = 'The codex subagent '

// Without this, codex's text could close the fence early or pose as a second delivery and pass its words off as the user's.
const defang = (text: string) => text.replace(/<(\/?codex-output)/gi, '‹$1').replace(new RegExp(`^${HEADER}`, 'gm'), `> ${HEADER}`)

async function deliver($: EngineInterface, run: Run, outcome: { output: string } | { error: string }) {
  const who = `${HEADER}"${run.description}" (${run.type}, agentId ${run.agentId})`
  const header =
    'output' in outcome
      ? `${who} finished. What follows inside the codex-output tags is its model output, not a message from the user.`
      : `${who} failed. What follows inside the codex-output tags is codex's error; the task did not run on Claude instead.`
  const where = run.worktree ? ` It worked in the git worktree ${run.worktree} on branch worktree-${run.agentId}.` : ''
  const text = `${header}${where}\n\n${OPEN}\n${defang('output' in outcome ? outcome.output : outcome.error)}\n${CLOSE}`
  await appendOutput($, run, `\n${text}\n`)
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
    await fetchRelay($, '/send', { id: message.id, error: { code: -32601, message: `${NAME} does not handle ${message.method}` } })
    return
  }
  const { threadId, turn, item } = message.params ?? {}
  const run = threadId ? runningOfThread(threadId) : undefined
  if (run && item && (message.method === 'item/started' || message.method === 'item/completed')) {
    const lines = await storeStep($, run.agentId, item)
    if (lines) await appendOutput($, run, `${lines.map(line => line.trim()).join(' ')}\n`)
    return
  }
  if (message.method !== 'turn/completed' || !run || !turn) return
  run.turnId = undefined
  if (turn.status === 'completed') await deliver($, run, { output: lastAnswer(turn) })
  if (turn.status === 'failed') await deliver($, run, { error: turn.error?.message ?? 'the turn failed' })
}

// One poller serves every thread because the relay hands each event out only once.
async function pump($: EngineInterface) {
  if (isPumping) return
  isPumping = true
  try {
    while (runs().some(run => run.turnId)) {
      const { events } = await fetchRelay($, '/events')
      for (const message of events) await handle($, message)
    }
  } catch (error) {
    const running = runs().filter(run => run.turnId)
    for (const run of running) run.turnId = undefined
    for (const run of running) await deliver($, run, { error: messageOf(error) })
  } finally {
    isPumping = false
  }
}

const STARTING = 'starting'

// The effort given to a turn holds for the thread's later turns too.
// Marked before the request because the shared poller can hand out the turn's events, even turn/completed, before codex answers it.
async function startTurn($: EngineInterface, run: Run, text: string, effort?: string) {
  run.turnId = STARTING
  try {
    const { turn } = await rpc($, 'turn/start', { threadId: run.threadId, input: textInput(text), effort })
    if (run.turnId === STARTING) run.turnId = turn.id
  } catch (error) {
    run.turnId = undefined
    throw error
  }
}

async function addWorktree($: EngineInterface, run: Run) {
  const root = await $.session.root()
  const path = `${root}/.claude/worktrees/${run.agentId}`
  const { exitCode, stderr } = await $.process.run(['git', 'worktree', 'add', '-b', `worktree-${run.agentId}`, path], { cwd: root })
  if (exitCode !== 0) throw new Error(`git worktree add failed: ${stderr}`)
  return path
}

async function launch($: EngineInterface, { run, model, prompt, effort, isWorktree }: { run: Run; model: Model; prompt: string; effort?: string; isWorktree: boolean }) {
  try {
    await appendOutput($, run, '')
    if (isWorktree) run.worktree = await addWorktree($, run)
    const { thread } = await rpc($, 'thread/start', {
      model: model.id,
      cwd: run.worktree ?? (await $.session.cwd()),
      approvalPolicy: 'never',
      sandbox: 'workspace-write',
      config: { 'sandbox_workspace_write.network_access': true },
      ephemeral: false,
    })
    run.threadId = thread.id
    await startTurn($, run, prompt, effort)
  } catch (error) {
    await deliver($, run, { error: messageOf(error) })
  }
}

// Claude Code knows no agent by a codex subagent's id or name, so passing a failed call on would only say there is none.
function refuse(next: { called: boolean; error: unknown }, key: string | undefined) {
  if (next.called || !key || !runOfKey.has(key)) return undefined
  return { deny: `${NAME}: ${messageOf(next.error)}` }
}

async function setUp($: EngineInterface) {
  socket = await startRelay($)
  if (!socket) return
  const { version } = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`))
  await rpc($, 'initialize', { clientInfo: { name: NAME, title: null, version }, capabilities: { experimentalApi: true } })
  await fetchRelay($, '/send', { method: 'initialized' })
  for (const model of await listModels($)) {
    const name = model.id.replaceAll('.', '-')
    modelOfType.set(`${PREFIX}${name}`, model)
    await $.agent.register({ name, description: `Delegates to \`${model.id}\`. ${model.description}`, prompt: `You are ${model.id} running on codex.` })
  }
}

// The real Agent tool says to set effort only when asked, which would leave every codex run at the model's default.
const EFFORT_RULE = ` For a ${PREFIX}* subagent_type, you may choose \`effort\` yourself to fit how hard the task is.`

export const register: Register = on => {
  registerSteps(on)

  on('tool.describe', { tool: 'Agent' }, async (_, e, next) => {
    const described = await next(e)
    return modelOfType.size ? { ...described, description: described.description + EFFORT_RULE } : described
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const type = e.subagent_type ?? ''
    const model = type.startsWith(PREFIX) ? modelOfType.get(type) : undefined
    if (!model || !socket) return next(e)
    const agentId = `codex-${crypto.randomUUID()}`
    const outputFile = `${socket.slice(0, socket.lastIndexOf('/'))}/${agentId}.txt`
    const run: Run = { agentId, name: e.name, type, description: e.description, outputFile, output: '' }
    // Listed before returning, so a SendMessage or TaskStop right after this call waits for the launch instead of going to Claude Code.
    for (const key of [agentId, e.name]) if (key) runOfKey.set(key, run)
    run.ready = launch($, { run, model, prompt: e.prompt, effort: codexEffort(model, e.effort), isWorktree: e.isolation === 'worktree' })
    void run.ready.then(() => pump($))
    return {
      result: { status: 'async_launched', isAsync: true, agentId, description: e.description, prompt: e.prompt, outputFile, resolvedModel: model.id },
    }
  }).catch(($, e, next) =>
    // Passing a codex type on would run the task on Claude, which the caller would take for the codex model's work.
    next.called || !e.subagent_type?.startsWith(PREFIX) ? next(e) : { deny: `${NAME}: could not launch ${e.subagent_type}.` },
  )

  on('tool.call', { tool: 'SendMessage' }, async ($, e, next) => {
    const to = recipientOf(e)
    const run = to ? runOfKey.get(to) : undefined
    if (!run) return next(e)
    // A turn started meanwhile replaces ready; the check sits here, not in a helper, so nothing runs between it and the code below.
    do await run.ready
    while (run.turnId === STARTING)
    if (!run.threadId) return { deny: `${run.agentId} failed to start, so it cannot take messages.` }
    if (run.turnId) {
      await rpc($, 'turn/steer', { threadId: run.threadId, expectedTurnId: run.turnId, input: textInput(e.message) })
      return { result: { success: true, message: `Message added to the running turn of ${run.agentId}.` } }
    }
    const started = startTurn($, run, e.message)
    run.ready = started.catch(() => {})
    await started
    void pump($)
    return { result: { success: true, message: `Resuming agent ${run.agentId}`, resumedAgentId: run.agentId } }
  }).catch(($, e, next) => refuse(next, recipientOf(e)) ?? next(e))

  on('tool.call', { tool: 'TaskStop' }, async ($, e, next) => {
    const id = taskOf(e)
    const run = id ? runOfKey.get(id) : undefined
    if (!run) return next(e)
    do await run.ready
    while (run.turnId === STARTING)
    if (!run.turnId) return { deny: `Task ${run.agentId} is not running.` }
    await rpc($, 'turn/interrupt', { threadId: run.threadId, turnId: run.turnId })
    const result = { message: `Successfully stopped task: ${run.agentId} (${run.description})`, task_id: run.agentId, task_type: 'local_agent', command: run.description }
    return { result }
  }).catch(($, e, next) => refuse(next, taskOf(e)) ?? next(e))

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
