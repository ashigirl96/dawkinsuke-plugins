import { expect, mock, test, type TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]
type Rpc = { method: string; params?: Record<string, unknown> }

const MODELS = [
  { id: 'gpt-6.1-sol', hidden: false, description: 'Latest workhorse model.' },
  { id: 'gpt-6-luna', hidden: false, description: 'Fast and affordable model.' },
  { id: 'gpt-secret', hidden: true, description: 'Hidden.' },
]

// Plays the relay: answers each JSON-RPC request from `answers` and hands out `events` one batch per poll.
const relay = (on: On, { answers = {}, events = [] }: { answers?: Record<string, unknown>; events?: unknown[][] } = {}) => {
  const requests: Rpc[] = []
  on('process.spawn', async function* () {
    yield { stream: 'stdout' as const, text: '{"socket":"/tmp/codex-subagent-x/relay.sock"}\n' }
    return { value: { code: 0, signal: null } }
  })
  on('http.fetch', (_, e) => {
    const path = new URL(e.url).pathname
    const body = e.init?.body ? JSON.parse(e.init.body) : undefined
    const respond = (value: unknown) => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(value) } })
    if (path === '/events') return respond({ events: events.shift() ?? [] })
    if (path !== '/rpc') return respond({})
    requests.push(body)
    const defaults: Record<string, unknown> = { 'model/list': { data: MODELS, nextCursor: null }, 'turn/start': { turn: { id: 'u1' } } }
    const answer = answers[body.method] ?? { result: defaults[body.method] ?? {} }
    return respond({ id: 1, ...(answer as object) })
  })
  return requests
}

const start = async ($: Parameters<TestBody>[0], on: On) => {
  const registered: { name: string; description: string }[] = []
  on('agent.register', (_, e) => (registered.push(e), { value: { agent: `codex-subagent:${e.name}` } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work' }))
  on('fs.write', () => ({ value: undefined }))
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  return registered
}

test('each model codex lists and does not hide becomes an Agent type named with dashes for dots', async ($, on) => {
  relay(on)
  const registered = await start($, on)
  expect(registered.map(r => r.name)).toEqual(['gpt-6-1-sol', 'gpt-6-luna'])
  expect(registered[0]?.description).toMatch(/^Delegates to `gpt-6\.1-sol`\. Latest workhorse model\./)
})

const THREAD = { result: { thread: { id: 't1' } } }
const turnCompleted = (turn: Record<string, unknown>) => ({ method: 'turn/completed', params: { threadId: 't1', turn: { id: 'u1', items: [], error: null, ...turn } } })

const delivered = (on: On) => {
  const texts: string[] = []
  on('prompt.submit', (_, e) => (texts.push(e.text), { text: e.text }))
  return texts
}

test('an Agent call of a codex type launches in the background and its last answer arrives as a new turn', async ($, on) => {
  const clock = mock.clock(on)
  const requests = relay(on, {
    answers: { 'thread/start': THREAD },
    events: [[turnCompleted({ status: 'completed', items: [{ type: 'agentMessage', text: 'found 3 bugs' }] })]],
  })
  const texts = delivered(on)
  await start($, on)

  const { result } = await $.tool.call({ tool: 'Agent', description: 'review', prompt: 'review the diff', subagent_type: 'codex-subagent:gpt-6-1-sol' })
  expect(result).toMatchObject({ status: 'async_launched', isAsync: true, description: 'review', prompt: 'review the diff', resolvedModel: 'gpt-6.1-sol' })
  await clock.settle()

  expect(requests.find(r => r.method === 'thread/start')?.params).toMatchObject({
    model: 'gpt-6.1-sol',
    cwd: '/work',
    approvalPolicy: 'never',
    sandbox: 'workspace-write',
    config: { 'sandbox_workspace_write.network_access': true },
    ephemeral: false,
  })
  expect(requests.find(r => r.method === 'turn/start')?.params).toMatchObject({ threadId: 't1', input: [{ type: 'text', text: 'review the diff' }] })
  expect(texts).toHaveLength(1)
  expect(texts[0]).toContain('codex-subagent:gpt-6-1-sol')
  expect(texts[0]).toContain('model output')
  expect(texts[0]).toEndWith('found 3 bugs')
})

for (const subagent_type of ['general-purpose', 'codex-subagent:gpt-unknown', undefined]) {
  test(`an Agent call of type ${subagent_type} goes on to Claude Code`, async ($, on) => {
    const requests = relay(on)
    on('tool.call', { tool: 'Agent' }, () => ({ result: 'engine' }))
    await start($, on)

    const { result } = await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type })
    expect(result).toBe('engine')
    expect(requests.map(r => r.method)).not.toContain('thread/start')
  })
}

test('a failed codex turn arrives as a failure carrying codex error message', async ($, on) => {
  const clock = mock.clock(on)
  relay(on, { answers: { 'thread/start': THREAD }, events: [[], [turnCompleted({ status: 'failed', error: { message: 'model not available for this account' } })]] })
  const texts = delivered(on)
  await start($, on)

  await $.tool.call({ tool: 'Agent', description: 'review', prompt: 'p', subagent_type: 'codex-subagent:gpt-6-luna' })
  await clock.settle()

  expect(texts).toHaveLength(1)
  expect(texts[0]).toContain('failed')
  expect(texts[0]).toContain('not run on Claude')
  expect(texts[0]).toEndWith('model not available for this account')
})

test('codex refusing to start the thread arrives as a failure too', async ($, on) => {
  const clock = mock.clock(on)
  relay(on, { answers: { 'thread/start': { error: { code: -32600, message: 'unknown model gpt-6-luna' } } } })
  const texts = delivered(on)
  await start($, on)

  const { result } = await $.tool.call({ tool: 'Agent', description: 'review', prompt: 'p', subagent_type: 'codex-subagent:gpt-6-luna' })
  expect(result).toMatchObject({ status: 'async_launched' })
  await clock.settle()

  expect(texts).toHaveLength(1)
  expect(texts[0]).toEndWith('unknown model gpt-6-luna')
})

test('a request codex sends is answered with an error so the turn does not stall', async ($, on) => {
  const clock = mock.clock(on)
  const sent: unknown[] = []
  on('http.fetch', { url: 'http://relay/send' }, (_, e) => (sent.push(JSON.parse(e.init!.body!)), { value: { status: 200, ok: true, headers: {}, text: '{}' } }))
  relay(on, {
    answers: { 'thread/start': THREAD },
    events: [[{ id: 7, method: 'item/tool/requestUserInput', params: {} }, turnCompleted({ status: 'completed', items: [] })]],
  })
  await start($, on)

  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type: 'codex-subagent:gpt-6-luna' })
  await clock.settle()

  expect(sent).toContainEqual({ id: 7, error: expect.objectContaining({ code: -32601 }) })
})

// Holds /events until the test pushes, so a codex turn stays running for as long as the test needs.
const heldEvents = (on: On) => {
  const queue: unknown[] = []
  let release = () => {}
  on('http.fetch', { url: 'http://relay/events' }, async () => {
    while (!queue.length) await new Promise<void>(resolve => (release = resolve))
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ events: queue.splice(0) }) } }
  })
  return (...events: unknown[]) => (queue.push(...events), release())
}

const answers = (texts: string[]) => texts.map(text => text.slice(text.lastIndexOf('\n') + 1))

test('a SendMessage to a running codex subagent by agentId steers its current turn', async ($, on) => {
  const clock = mock.clock(on)
  const push = heldEvents(on)
  const requests = relay(on, { answers: { 'thread/start': THREAD, 'turn/steer': { result: { turnId: 'u1' } } } })
  const texts = delivered(on)
  await start($, on)

  const { result } = await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type: 'codex-subagent:gpt-6-luna' })
  await clock.settle()
  const { agentId } = result as { agentId: string }
  await $.tool.call({ tool: 'SendMessage', to: agentId, message: 'also check the tests' })
  push(turnCompleted({ id: 'u1', status: 'completed', items: [{ type: 'agentMessage', text: 'checked both' }] }))
  await clock.settle()

  expect(requests.find(r => r.method === 'turn/steer')?.params).toMatchObject({
    threadId: 't1',
    expectedTurnId: 'u1',
    input: [{ type: 'text', text: 'also check the tests' }],
  })
  expect(requests.filter(r => r.method === 'turn/start')).toHaveLength(1)
  expect(answers(texts)).toEqual(['checked both'])
})

test('a SendMessage by name to a finished codex subagent runs a new turn on its thread and delivers again', async ($, on) => {
  const clock = mock.clock(on)
  const push = heldEvents(on)
  const requests = relay(on, { answers: { 'thread/start': THREAD } })
  const texts = delivered(on)
  await start($, on)

  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type: 'codex-subagent:gpt-6-luna', name: 'reviewer' })
  push(turnCompleted({ id: 'u1', status: 'completed', items: [{ type: 'agentMessage', text: 'first' }] }))
  await clock.settle()
  await $.tool.call({ tool: 'SendMessage', to: 'reviewer', message: 'now fix them' })
  push(turnCompleted({ id: 'u1', status: 'completed', items: [{ type: 'agentMessage', text: 'second' }] }))
  await clock.settle()

  expect(requests.filter(r => r.method === 'turn/start').map(r => r.params)).toMatchObject([
    { threadId: 't1' },
    { threadId: 't1', input: [{ type: 'text', text: 'now fix them' }] },
  ])
  expect(answers(texts)).toEqual(['first', 'second'])
})

test('a SendMessage to anyone else goes on to Claude Code', async ($, on) => {
  const requests = relay(on)
  on('tool.call', { tool: 'SendMessage' }, () => ({ result: 'engine' }))
  await start($, on)

  const { result } = await $.tool.call({ tool: 'SendMessage', to: 'main', message: 'hi' })
  expect(result).toBe('engine')
  expect(requests.map(r => r.method)).not.toContain('turn/start')
})

test('a TaskStop of a running codex subagent interrupts its turn and delivers nothing', async ($, on) => {
  const clock = mock.clock(on)
  const push = heldEvents(on)
  const requests = relay(on, { answers: { 'thread/start': THREAD } })
  const texts = delivered(on)
  await start($, on)

  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type: 'codex-subagent:gpt-6-luna', name: 'reviewer' })
  await clock.settle()
  const { result } = await $.tool.call({ tool: 'TaskStop', task_id: 'reviewer' })
  push(turnCompleted({ id: 'u1', status: 'interrupted' }))
  await clock.settle()

  expect(result).toMatchObject({ task_type: 'local_agent', command: 'd' })
  expect(requests.find(r => r.method === 'turn/interrupt')?.params).toEqual({ threadId: 't1', turnId: 'u1' })
  expect(texts).toEqual([])
})

test('a TaskStop of anything else goes on to Claude Code', async ($, on) => {
  const requests = relay(on)
  on('tool.call', { tool: 'TaskStop' }, () => ({ result: 'engine' }))
  await start($, on)

  const { result } = await $.tool.call({ tool: 'TaskStop', task_id: 'b1234' })
  expect(result).toBe('engine')
  expect(requests.map(r => r.method)).not.toContain('turn/interrupt')
})
