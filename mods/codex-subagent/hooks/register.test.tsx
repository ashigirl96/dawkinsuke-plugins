import { expect, mock, test, type TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]
type Rpc = { method: string; params?: Record<string, unknown> }

const efforts = (...names: string[]) => names.map(reasoningEffort => ({ reasoningEffort, description: '' }))
const MODELS = [
  { id: 'gpt-6.1-sol', hidden: false, description: 'Latest workhorse model.', supportedReasoningEfforts: efforts('low', 'medium', 'high', 'ultra') },
  { id: 'gpt-6-luna', hidden: false, description: 'Fast and affordable model.', supportedReasoningEfforts: efforts('medium', 'high') },
  { id: 'gpt-secret', hidden: true, description: 'Hidden.', supportedReasoningEfforts: [] },
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
  expect(registered[0]?.description).toContain('choose `effort` yourself')
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

const EFFORT_CASES: [string, 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined, string | undefined][] = [
  ['gpt-6-1-sol', 'max', 'ultra'],
  ['gpt-6-1-sol', 'xhigh', 'high'],
  ['gpt-6-1-sol', 'medium', 'medium'],
  ['gpt-6-luna', 'low', undefined],
  ['gpt-6-1-sol', undefined, undefined],
]
for (const [name, effort, expected] of EFFORT_CASES) {
  test(`effort ${effort} on ${name} reaches codex as ${expected ?? "the model's default"}`, async ($, on) => {
    const clock = mock.clock(on)
    const requests = relay(on, { answers: { 'thread/start': THREAD }, events: [[turnCompleted({ status: 'completed' })]] })
    await start($, on)

    await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type: `codex-subagent:${name}`, effort })
    await clock.settle()

    expect(requests.find(r => r.method === 'turn/start')?.params?.effort).toBe(expected)
  })
}

const gitRuns = (on: On, exitCode = 0) => {
  const runs: { argv: readonly string[]; cwd?: string }[] = []
  on('process.run', (_, e) => {
    runs.push({ argv: e.argv, cwd: e.init?.cwd })
    const stderr = exitCode ? 'fatal: not a git repository' : ''
    return { value: { exitCode, stdout: '', stderr, isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return runs
}

test('isolation worktree runs the thread in a new git worktree under the project root and says where', async ($, on) => {
  const clock = mock.clock(on)
  const requests = relay(on, {
    answers: { 'thread/start': THREAD },
    events: [[turnCompleted({ status: 'completed', items: [{ type: 'agentMessage', text: 'done' }] })]],
  })
  const runs = gitRuns(on)
  on('session.root', () => ({ value: '/work' }))
  const texts = delivered(on)
  await start($, on)

  const { result } = await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type: 'codex-subagent:gpt-6-luna', isolation: 'worktree' })
  await clock.settle()

  const { agentId } = result as { agentId: string }
  const path = `/work/.claude/worktrees/${agentId}`
  expect(runs).toEqual([{ argv: ['git', 'worktree', 'add', '-b', `worktree-${agentId}`, path], cwd: '/work' }])
  expect(requests.find(r => r.method === 'thread/start')?.params?.cwd).toBe(path)
  expect(texts[0]).toContain(path)
})

test('a worktree git cannot make arrives as a failure and starts no thread', async ($, on) => {
  const clock = mock.clock(on)
  const requests = relay(on)
  gitRuns(on, 128)
  on('session.root', () => ({ value: '/work' }))
  const texts = delivered(on)
  await start($, on)

  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type: 'codex-subagent:gpt-6-luna', isolation: 'worktree' })
  await clock.settle()

  expect(requests.map(r => r.method)).not.toContain('thread/start')
  expect(texts[0]).toContain('not a git repository')
})

const item = (method: string, item: Record<string, unknown>) => ({ method, params: { threadId: 't1', item } })
const command = (id: string, command: string, rest: Record<string, unknown>) => item('item/completed', { type: 'commandExecution', id, command, ...rest })

// Stands for the engine drawing the row itself.
const engineRow = (on: On) =>
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>Agent(review)</Text>
  })

const agentRow = ($: Parameters<TestBody>[0], output: unknown, isExpanded?: boolean) =>
  $.ui.mount({
    plugin: 'codex-subagent',
    surface: 'terminal',
    component: 'ToolUse',
    requestId: 'tu1',
    props: { tool_use_id: 'tu1', tool: 'Agent', input: { subagent_type: 'codex-subagent:gpt-6-luna' }, isRunning: false, isErrored: false, isInterrupted: false, isExpanded, output },
  })

test('codex commands and edits are drawn under the Agent row while codex runs', async ($, on) => {
  const clock = mock.clock(on)
  relay(on, {
    answers: { 'thread/start': THREAD },
    events: [
      [
        command('c1', "/bin/zsh -lc 'echo hello &&\n  ls -a'", { status: 'completed', aggregatedOutput: 'hello\nl1\nl2\nl3\n\n', exitCode: 0 }),
        item('item/completed', {
          type: 'fileChange',
          id: 'f1',
          status: 'completed',
          changes: [
            { path: '/work/note.txt', kind: { type: 'add' }, diff: 'hi\n' },
            { path: '/work/old.txt', kind: { type: 'delete' }, diff: '' },
            { path: '/work/a.ts', kind: { type: 'update', move_path: null }, diff: '@@' },
          ],
        }),
        item('item/started', { type: 'commandExecution', id: 'c2', command: 'bun test', status: 'inProgress', aggregatedOutput: null, exitCode: null }),
        item('item/completed', { type: 'agentMessage', id: 'm1', text: 'thinking out loud' }),
        turnCompleted({ status: 'completed' }),
      ],
    ],
  })
  engineRow(on)
  await start($, on)

  const { result } = await $.tool.call({ tool: 'Agent', description: 'review', prompt: 'p', subagent_type: 'codex-subagent:gpt-6-luna' })
  await clock.settle()
  const ui = await agentRow($, result)

  const texts = await Promise.all(
    ['Bash\\(echo hello', 'exit 0', 'Write', 'Delete', 'Update', 'Bash\\(bun', 'running', 'thinking'].map(async text => (await ui.find({ type: 'Text', text: new RegExp(text) }))?.text),
  )
  expect(texts).toEqual([
    '⎿  Bash(echo hello && ls -a)',
    '   exit 0 · l1 · l2 · l3',
    '⎿  Write(/work/note.txt)',
    '⎿  Delete(/work/old.txt)',
    '⎿  Update(/work/a.ts)',
    '⎿  Bash(bun test)',
    '   running…',
    undefined,
  ])
})

test('a command that is redrawn on completion replaces its running line, and a failure shows its exit code', async ($, on) => {
  const clock = mock.clock(on)
  relay(on, {
    answers: { 'thread/start': THREAD },
    events: [
      [item('item/started', { type: 'commandExecution', id: 'c1', command: 'false', status: 'inProgress', aggregatedOutput: null, exitCode: null })],
      [command('c1', 'false', { status: 'failed', aggregatedOutput: '', exitCode: 1 }), turnCompleted({ status: 'completed' })],
    ],
  })
  engineRow(on)
  await start($, on)

  const { result } = await $.tool.call({ tool: 'Agent', description: 'review', prompt: 'p', subagent_type: 'codex-subagent:gpt-6-luna' })
  await clock.settle()
  const ui = await agentRow($, result)

  expect((await ui.find({ type: 'Text', text: /exit/ }))?.text).toBe('   exit 1')
  expect(await ui.find({ type: 'Text', text: /running/ })).toBeUndefined()
})

test('only the last few codex items show until the row is expanded', async ($, on) => {
  const clock = mock.clock(on)
  const commands = Array.from({ length: 7 }, (_, i) => command(`c${i}`, `echo ${i}`, { status: 'completed', aggregatedOutput: '', exitCode: 0 }))
  relay(on, { answers: { 'thread/start': THREAD }, events: [[...commands, turnCompleted({ status: 'completed' })]] })
  engineRow(on)
  await start($, on)

  const { result } = await $.tool.call({ tool: 'Agent', description: 'review', prompt: 'p', subagent_type: 'codex-subagent:gpt-6-luna' })
  await clock.settle()

  const folded = await agentRow($, result)
  expect((await folded.find({ type: 'Text', text: /more/ }))?.text).toBe('   … +2 more')
  expect(await folded.find({ type: 'Text', text: /echo 1\)/ })).toBeUndefined()
  expect(await folded.find({ type: 'Text', text: /echo 6\)/ })).toBeDefined()
  await folded.unmount()

  const expanded = await agentRow($, result, true)
  expect(await expanded.find({ type: 'Text', text: /echo 0\)/ })).toBeDefined()
})

test('an Agent row of another type is drawn as the engine draws it', async ($, on) => {
  engineRow(on)
  const ui = await $.ui.mount({
    plugin: 'codex-subagent',
    surface: 'terminal',
    component: 'ToolUse',
    requestId: 'tu2',
    props: { tool_use_id: 'tu2', tool: 'Agent', input: { subagent_type: 'general-purpose' }, isRunning: true, isErrored: false, isInterrupted: false },
  })
  expect(await ui.find({ type: 'Text', text: /⎿/ })).toBeUndefined()
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
