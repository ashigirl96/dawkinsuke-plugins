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
    const answer = answers[body.method] ?? { result: body.method === 'model/list' ? { data: MODELS, nextCursor: null } : {} }
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
