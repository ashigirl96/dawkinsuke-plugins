import { expect, mock, test, type TestBody } from 'claude-code/testing'

type $ = Parameters<TestBody>[0]
type On = Parameters<TestBody>[1]
type Rpc = { method: string; params?: Record<string, unknown> }

const TOOL = 'mcp__codex-subagent__codex'

const efforts = (...names: string[]) => names.map(reasoningEffort => ({ reasoningEffort, description: '' }))
const MODELS = [
  { id: 'gpt-6.1-sol', hidden: false, description: 'Latest workhorse model.', supportedReasoningEfforts: efforts('low', 'medium', 'high', 'ultra') },
  { id: 'gpt-6-luna', hidden: false, description: 'Fast and affordable model.', supportedReasoningEfforts: efforts('medium', 'high') },
  { id: 'gpt-secret', hidden: true, description: 'Hidden.', supportedReasoningEfforts: [] },
]

type Answer = unknown | ((params: Record<string, unknown>) => unknown)

const ok = (value: unknown) => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(value) } })

const relay = (on: On, { answers = {}, events = [] }: { answers?: Record<string, Answer>; events?: unknown[][] } = {}) => {
  const requests: Rpc[] = []
  on('process.spawn', async function* () {
    yield { stream: 'stdout' as const, text: '{"socket":"/tmp/codex-subagent-x/relay.sock"}\n' }
    return { value: { code: 0, signal: null } }
  })
  on('http.fetch', async (_, e) => {
    const path = new URL(e.url).pathname
    const body = e.init?.body ? JSON.parse(e.init.body) : undefined
    if (path === '/events') return ok({ events: events.shift() ?? [] })
    if (path !== '/rpc') return ok({})
    requests.push(body)
    const defaults: Record<string, unknown> = { 'model/list': { data: MODELS, nextCursor: null }, 'turn/start': { turn: { id: 'u1' } } }
    const given = answers[body.method]
    const answer = (typeof given === 'function' ? await given(body.params) : given) ?? { result: defaults[body.method] ?? {} }
    return ok({ id: 1, ...(answer as object) })
  })
  return requests
}

const start = async ($: $, on: On, cwd = '/work') => {
  const registered: { name: string; description: string; tools?: readonly string[] }[] = []
  const tools: { name: string; isDeferred?: unknown }[] = []
  on('agent.register', (_, e) => (registered.push(e), { value: { agent: `codex-subagent:${e.name}` } }))
  on('tool.register', (_, e) => (tools.push(e), { value: { tool: `mcp__codex-subagent__${e.name}` } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: cwd }))
  on('fs.read', () => ({ value: '{"name":"codex-subagent","version":"9.9.9"}' }))
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  return { registered, tools }
}

type AgentStatus = 'running' | 'completed'

const agents = (on: On, list: { id: string; type: string; status?: AgentStatus }[]) =>
  on('agent.list', () => ({ value: list.map(agent => ({ status: 'running' as const, ...agent, description: 'd' })) }))

const sendTo = ($: $, text: string) => $.session.receive({ origin: { kind: 'coordinator' }, text, agentId: 'a1' })

test('each model codex lists and does not hide becomes an Agent type named with dashes for dots', async ($, on) => {
  relay(on)
  const { registered } = await start($, on)
  expect(registered.map(r => r.name)).toEqual(['gpt-6-1-sol', 'gpt-6-luna'])
  expect(registered[0]?.description).toMatch(/^Delegates to `gpt-6\.1-sol`\. Latest workhorse model\./)
})

test('a codex type may call only the codex tool and SubagentHandback, and the codex tool is registered once', async ($, on) => {
  relay(on)
  const { registered, tools } = await start($, on)
  for (const agent of registered) expect(agent.tools).toEqual([TOOL, 'SubagentHandback'])
  expect(tools.map(t => t.name)).toEqual(['codex'])
})

test('no relay means no codex type, no codex tool and no fetch over TCP', async ($, on) => {
  const fetched: string[] = []
  on('process.spawn', async function* () {
    yield { stream: 'stderr' as const, text: 'bun: command not found\n' }
    return { value: { code: 127, signal: null } }
  })
  on('http.fetch', (_, e) => (fetched.push(e.url), ok({})))
  const { registered, tools } = await start($, on)

  expect(registered).toEqual([])
  expect(tools).toEqual([])
  expect(fetched).toEqual([])
})

test('a relay whose spawn throws leaves no codex type and lets the session start', async ($, on) => {
  on('process.spawn', async function* () {
    yield* []
    throw new Error('spawn failed')
  })
  const { registered } = await start($, on)
  expect(registered).toEqual([])
})

test('a second session.start in the same worker starts no second relay and registers nothing again', async ($, on) => {
  const requests = relay(on)
  const { registered } = await start($, on)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

  expect(requests.filter(r => r.method === 'initialize')).toHaveLength(1)
  expect(registered).toHaveLength(2)
})

type Row = { role: 'user' | 'assistant'; text: string; toolUses: { tool_use_id: string; tool: string; input: Record<string, unknown> }[]; toolResults?: { tool_use_id: string; text: string; isError: boolean }[] }

const user = (text: string): Row => ({ role: 'user', text, toolUses: [] })
const called = (id: string, tool: string): Row => ({ role: 'assistant', text: '', toolUses: [{ tool_use_id: id, tool, input: {} }] })
const answered = (id: string, text: string, isError = false): Row => ({ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: id, text, isError }] })

type StepOptions = { isMain?: boolean; type?: string; status?: AgentStatus; send?: string }

const stepOf = async ($: $, on: On, rows: Row[], { isMain = false, type = 'codex-subagent:gpt-6-luna', status = 'running', send }: StepOptions = {}) => {
  const passed: unknown[] = []
  on('turn.step', async function* (_, e) {
    passed.push(e)
    return { turnId: e.turnId, index: e.index, answer: 'claude', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  on('session.messages', () => ({ value: rows }))
  agents(on, [{ id: 'a1', type, status }])
  on('session.receive', (_, e) => ({ text: e.text }))
  relay(on)
  await start($, on)
  const sent = send === undefined ? undefined : await sendTo($, send)
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet', messageCount: rows.length, agentId: isMain ? undefined : 'a1' })
  const chunks: unknown[] = []
  for (;;) {
    const { done, value } = await stream.next()
    if (done) return { chunks, result: value, passed, sent }
    chunks.push(value)
  }
}

const toolCalled = (chunks: unknown[]) => {
  const tool = chunks.find(c => (c as { kind: string }).kind === 'tool') as { name: string } | undefined
  const json = chunks.filter(c => (c as { kind: string }).kind === 'input').map(c => (c as { json: string }).json).join('')
  return tool && { name: tool.name, input: JSON.parse(json) }
}

test('the first step of a codex subagent calls the codex tool with its prompt and asks no model', async ($, on) => {
  const { chunks, result, passed } = await stepOf($, on, [user('review the diff')])

  expect(passed).toEqual([])
  expect(toolCalled(chunks)).toEqual({ name: TOOL, input: { prompt: 'review the diff' } })
  expect(result).toMatchObject({ stopReason: 'tool_use', toolUses: [{ name: TOOL, input: { prompt: 'review the diff' } }] })
})

test('the step after the codex tool answered hands its answer back to the parent', async ($, on) => {
  const { chunks, result, passed } = await stepOf($, on, [user('review the diff'), called('x1', TOOL), answered('x1', 'found 3 bugs')])

  expect(passed).toEqual([])
  expect(toolCalled(chunks)).toEqual({ name: 'SubagentHandback', input: { message: 'found 3 bugs' } })
  expect(result).toMatchObject({ stopReason: 'tool_use' })
})

test('a failed codex tool is handed back as a failure carrying codex error', async ($, on) => {
  const { chunks } = await stepOf($, on, [user('p'), called('x1', TOOL), answered('x1', 'model not available for this account', true)])

  const message: string = toolCalled(chunks)?.input.message
  expect(message).toContain('failed')
  expect(message).toContain('model not available for this account')
})

test('a step after the handback ends the turn without calling codex again', async ($, on) => {
  const { chunks, result } = await stepOf($, on, [user('p'), called('x1', TOOL), answered('x1', 'a'), called('h1', 'SubagentHandback'), answered('h1', 'sent')])

  expect(toolCalled(chunks)).toBeUndefined()
  expect(result).toMatchObject({ stopReason: 'end_turn', toolUses: [] })
})

test('a resumed codex subagent calls codex again with the message it was sent', async ($, on) => {
  const { chunks } = await stepOf($, on, [user('p'), called('x1', TOOL), answered('x1', 'a'), called('h1', 'SubagentHandback'), answered('h1', 'sent'), user('now fix them')])

  expect(toolCalled(chunks)).toEqual({ name: TOOL, input: { prompt: 'now fix them' } })
})

for (const [who, options] of [
  ['the main loop', { isMain: true }],
  ['a subagent of another type', { type: 'general-purpose' }],
] as const) {
  test(`a step of ${who} goes on to the model`, async ($, on) => {
    const { chunks, result, passed } = await stepOf($, on, [user('p')], options)

    expect(passed).toHaveLength(1)
    expect(chunks).toEqual([])
    expect(result).toMatchObject({ answer: 'claude' })
  })
}

const THREAD = { result: { thread: { id: 't1' } } }
const turnCompleted = (turn: Record<string, unknown>, threadId = 't1') => ({ method: 'turn/completed', params: { threadId, turn: { id: 'u1', items: [], error: null, ...turn } } })

const runCodex = ($: $, prompt: string, agentId = 'a1') => $.tool.call({ tool: TOOL, prompt, agentId })

test('the codex tool runs a codex turn to the end and answers with its last agent message', async ($, on) => {
  const requests = relay(on, {
    answers: { 'thread/start': THREAD },
    events: [[], [turnCompleted({ status: 'completed', items: [{ type: 'agentMessage', text: 'thinking' }, { type: 'agentMessage', text: 'found 3 bugs' }] })]],
  })
  agents(on, [{ id: 'a1', type: 'codex-subagent:gpt-6-1-sol' }])
  await start($, on)

  const { result } = await runCodex($, 'review the diff')

  expect(result).toBe('found 3 bugs')
  expect(requests.find(r => r.method === 'thread/start')?.params).toMatchObject({
    model: 'gpt-6.1-sol',
    cwd: '/work',
    approvalPolicy: 'never',
    sandbox: 'workspace-write',
    config: { 'sandbox_workspace_write.network_access': true },
    ephemeral: false,
  })
  expect(requests.find(r => r.method === 'turn/start')?.params).toMatchObject({ threadId: 't1', input: [{ type: 'text', text: 'review the diff' }] })
})

// The Agent call goes in first, then its subagent starts under the call's tool_use_id, as Claude Code orders them.
const agentCall = async ($: $, input: Record<string, unknown>) => {
  await $.tool.call({ tool: 'Agent', tool_use_id: 'c1', prompt: 'p', ...input })
  await $.agent.spawn({
    tool_use_id: 'c1',
    prompt: 'p',
    description: 'd',
    subagentType: String(input.subagent_type),
    provider: { plugin: 'codex-subagent', tier: 'user' },
    parentModel: 'claude-sonnet',
    background: true,
    fork: false,
  })
}

const coreAnswersAgent = (on: On) => {
  on('tool.call', { tool: 'Agent' }, () => ({ result: 'Backgrounded agent' }))
  on('agent.spawn', () => ({ model: 'claude-sonnet', agentId: 'a1' }))
}

for (const [given, sent] of [
  ['xhigh', 'high'],
  ['max', 'ultra'],
  [undefined, undefined],
] as const) {
  test(`effort ${given} on the Agent call reaches the codex turn as ${sent}`, async ($, on) => {
    const requests = relay(on, { answers: { 'thread/start': THREAD }, events: [[turnCompleted({ status: 'completed' })]] })
    agents(on, [{ id: 'a1', type: 'codex-subagent:gpt-6-1-sol' }])
    coreAnswersAgent(on)
    await start($, on)

    await agentCall($, { subagent_type: 'codex-subagent:gpt-6-1-sol', ...(given && { effort: given }) })
    await runCodex($, 'p')

    expect(requests.find(r => r.method === 'turn/start')?.params?.effort).toBe(sent)
  })
}

test('a codex subagent Claude Code put in a worktree runs its codex thread there', async ($, on) => {
  const requests = relay(on, { answers: { 'thread/start': THREAD }, events: [[turnCompleted({ status: 'completed' })]] })
  agents(on, [{ id: 'a1', type: 'codex-subagent:gpt-6-luna' }])
  coreAnswersAgent(on)
  // Inside the subagent's own tool call, the session's directory is its worktree.
  await start($, on, '/repo/.claude/worktrees/agent-a1')

  await agentCall($, { subagent_type: 'codex-subagent:gpt-6-luna', isolation: 'worktree' })
  await runCodex($, 'p')

  expect(requests.find(r => r.method === 'thread/start')?.params?.cwd).toBe('/repo/.claude/worktrees/agent-a1')
})

test('a second codex tool call of the same subagent goes on in the same thread', async ($, on) => {
  let turns = 0
  const requests = relay(on, {
    answers: { 'thread/start': THREAD, 'turn/start': () => ({ result: { turn: { id: `u${++turns}` } } }) },
    events: [[turnCompleted({ id: 'u1', status: 'completed' })], [turnCompleted({ id: 'u2', status: 'completed', items: [{ type: 'agentMessage', text: 'second' }] })]],
  })
  agents(on, [{ id: 'a1', type: 'codex-subagent:gpt-6-luna' }])
  await start($, on)

  await runCodex($, 'first')
  const { result } = await runCodex($, 'now fix them')

  expect(result).toBe('second')
  expect(requests.filter(r => r.method === 'thread/start')).toHaveLength(1)
  expect(requests.filter(r => r.method === 'turn/start').map(r => r.params)).toMatchObject([{ threadId: 't1' }, { threadId: 't1', input: [{ text: 'now fix them' }] }])
})

test('a failed codex turn is a failed tool call carrying codex error message', async ($, on) => {
  relay(on, { answers: { 'thread/start': THREAD }, events: [[turnCompleted({ status: 'failed', error: { message: 'model not available for this account' } })]] })
  agents(on, [{ id: 'a1', type: 'codex-subagent:gpt-6-luna' }])
  await start($, on)

  expect(await runCodex($, 'p')).toEqual({ deny: 'model not available for this account' })
})

test('codex refusing to start the thread is a failed tool call too', async ($, on) => {
  relay(on, { answers: { 'thread/start': { error: { code: -32600, message: 'unknown model gpt-6-luna' } } } })
  agents(on, [{ id: 'a1', type: 'codex-subagent:gpt-6-luna' }])
  await start($, on)

  expect(await runCodex($, 'p')).toEqual({ deny: 'unknown model gpt-6-luna' })
})

test('the codex tool called outside a codex subagent is refused and starts no thread', async ($, on) => {
  const requests = relay(on)
  agents(on, [{ id: 'a1', type: 'general-purpose' }])
  await start($, on)

  expect(await runCodex($, 'p')).toMatchObject({ deny: expect.stringContaining('codex-subagent:') })
  expect(await $.tool.call({ tool: TOOL, prompt: 'p' })).toMatchObject({ deny: expect.any(String) })
  expect(requests.map(r => r.method)).not.toContain('thread/start')
})

test('a request codex sends is answered with an error so the turn does not stall', async ($, on) => {
  const sent: unknown[] = []
  on('http.fetch', { url: 'http://relay/send' }, (_, e) => (sent.push(JSON.parse(e.init!.body!)), ok({})))
  relay(on, { answers: { 'thread/start': THREAD }, events: [[{ id: 7, method: 'item/tool/requestUserInput', params: {} }, turnCompleted({ status: 'completed' })]] })
  agents(on, [{ id: 'a1', type: 'codex-subagent:gpt-6-luna' }])
  await start($, on)

  await runCodex($, 'p')

  expect(sent).toContainEqual({ id: 7, error: expect.objectContaining({ code: -32601 }) })
})

test('two codex subagents at once each get their own answer, whichever call polled it', async ($, on) => {
  let threads = 0
  relay(on, {
    answers: {
      'thread/start': () => ({ result: { thread: { id: `t${++threads}` } } }),
      'turn/start': (params: Record<string, unknown>) => ({ result: { turn: { id: `u-${params.threadId}` } } }),
    },
    events: [
      [],
      [
        turnCompleted({ id: 'u-t2', status: 'completed', items: [{ type: 'agentMessage', text: 'from two' }] }, 't2'),
        turnCompleted({ id: 'u-t1', status: 'completed', items: [{ type: 'agentMessage', text: 'from one' }] }, 't1'),
      ],
    ],
  })
  agents(on, [
    { id: 'a1', type: 'codex-subagent:gpt-6-luna' },
    { id: 'a2', type: 'codex-subagent:gpt-6-luna' },
  ])
  await start($, on)

  const [one, two] = await Promise.all([runCodex($, 'p', 'a1'), runCodex($, 'p', 'a2')])

  expect([one.result, two.result]).toEqual(['from one', 'from two'])
})

// Stands above the mod and settles the call itself, which abandons the dispatch beneath, as a TaskStop does.
const stopper = {
  name: 'stopper',
  tier: 'prepend' as const,
  register(on: On) {
    on('tool.call', { tool: 'mcp__codex-subagent__codex' }, async ($, e, next) => {
      void next(e)
      await $.clock.sleep(20)
      return { result: 'stopped' }
    })
  },
}

test('a codex tool call whose dispatch is abandoned interrupts the codex turn', { plugins: [stopper] }, async ($, on) => {
  const interrupted: unknown[] = []
  let release = () => {}
  on('http.fetch', { url: 'http://relay/events' }, async () => {
    await new Promise<void>(resolve => (release = resolve))
    return ok({ events: [turnCompleted({ status: 'interrupted' })] })
  })
  relay(on, { answers: { 'thread/start': THREAD, 'turn/interrupt': (params: unknown) => (interrupted.push(params), release(), { result: {} }) } })
  agents(on, [{ id: 'a1', type: 'codex-subagent:gpt-6-luna' }])
  const clock = mock.clock(on)
  await start($, on)

  const call = runCodex($, 'p')
  await clock.advance(20)
  expect((await call).result).toBe('stopped')
  await clock.settle()
  expect(interrupted).toEqual([{ threadId: 't1', turnId: 'u1' }])
})

test('a message a running codex subagent receives, which arrives only after codex answered, goes to codex as one more turn before the handback', async ($, on) => {
  const { chunks, sent } = await stepOf($, on, [user('say ALPHA'), called('x1', TOOL), answered('x1', 'ALPHA')], { send: 'add BRAVO' })

  expect(sent).toMatchObject({ consumed: expect.any(String) })
  expect(toolCalled(chunks)).toEqual({ name: TOOL, input: { prompt: 'add BRAVO' } })
})

test('a message sent to a finished codex subagent is queued, so Claude Code resumes it with the message', async ($, on) => {
  const { chunks, sent } = await stepOf($, on, [user('say ALPHA'), called('x1', TOOL), answered('x1', 'ALPHA')], { send: 'add BRAVO', status: 'completed' })

  expect(sent).toEqual({ text: 'add BRAVO' })
  expect(toolCalled(chunks)?.name).toBe('SubagentHandback')
})
