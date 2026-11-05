import { expect, mock, test, type TestBody } from 'claude-code/testing'

type $ = Parameters<TestBody>[0]
type On = Parameters<TestBody>[1]
type Rpc = { method: string; params?: Record<string, unknown> }

const COMMAND = 'mcp__codex-subagent__command'
const FILE_CHANGE = 'mcp__codex-subagent__file_change'
const WAIT = 'mcp__codex-subagent__wait'
const HANDBACK = 'SubagentHandback'

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
    const defaults: Record<string, unknown> = {
      'model/list': { data: MODELS, nextCursor: null },
      'thread/start': { thread: { id: 't1' } },
      'turn/start': { turn: { id: 'u1' } },
    }
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

test('each model codex lists and does not hide becomes an Agent type named with dashes for dots', async ($, on) => {
  relay(on)
  const { registered } = await start($, on)
  expect(registered.map(r => r.name)).toEqual(['gpt-6-1-sol', 'gpt-6-luna'])
  expect(registered[0]?.description).toMatch(/^Delegates to `gpt-6\.1-sol`\. Latest workhorse model\./)
})

test('a codex type may call only the item tools, Agent and SubagentHandback, and the item tools are registered once', async ($, on) => {
  relay(on)
  const { registered, tools } = await start($, on)
  for (const agent of registered) expect(agent.tools).toEqual([COMMAND, FILE_CHANGE, WAIT, 'Agent', HANDBACK])
  expect(tools.map(t => t.name)).toEqual(['command', 'file_change', 'wait'])
})

test('no relay means no codex type, no item tool and no fetch over TCP', async ($, on) => {
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

for (const method of ['initialize', 'model/list']) {
  test(`codex refusing ${method} leaves no codex type and no item tool, and lets every session start`, async ($, on) => {
    relay(on, { answers: { [method]: { error: { code: -32603, message: 'codex is not signed in' } } } })
    const { registered, tools } = await start($, on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

    expect(registered).toEqual([])
    expect(tools).toEqual([])
  })
}

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

type Step = { text: string; tool?: string; input?: Record<string, unknown>; stopReason: string }

const stepAs = async ($: $, agentId: string | undefined, messageCount = 1): Promise<Step> => {
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-sonnet', messageCount, agentId })
  const chunks: { kind: string; text?: string; name?: string; json?: string; stopReason?: string }[] = []
  for (;;) {
    const { done, value } = await stream.next()
    if (done) break
    chunks.push(value as never)
  }
  const tool = chunks.find(c => c.kind === 'tool')?.name
  const json = chunks.filter(c => c.kind === 'input').map(c => c.json).join('')
  const text = chunks.filter(c => c.kind === 'text').map(c => c.text).join('')
  const stopReason = chunks.find(c => c.kind === 'stop')?.stopReason ?? ''
  return tool ? { text, tool, input: JSON.parse(json), stopReason } : { text, stopReason }
}

const subagent = (on: On, { type = 'codex-subagent:gpt-6-luna', status = 'running' as AgentStatus, agentId = 'a1' } = {}) => {
  const rows: Row[] = []
  const passed: unknown[] = []
  on('turn.step', async function* (_, e) {
    passed.push(e)
    return { turnId: e.turnId, index: e.index, answer: 'claude', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  on('session.messages', () => ({ value: rows }))
  agents(on, [{ id: agentId, type, status }])
  const step = ($: $, isMain = false) => stepAs($, isMain ? undefined : agentId, rows.length)
  const act = async ($: $, s: Step) => {
    const id = `x${rows.length}`
    rows.push(called(id, s.tool!))
    const answer = s.tool === HANDBACK ? { result: 'sent' } : await $.tool.call({ tool: s.tool!, ...s.input, agentId })
    rows.push('deny' in answer && answer.deny ? answered(id, String(answer.deny), true) : answered(id, String(answer.result)))
    return answer
  }
  return { rows, passed, step, act }
}

const item = (method: 'item/started' | 'item/completed', body: Record<string, unknown>, threadId = 't1') => ({ method, params: { threadId, item: body } })
const said = (text: string, threadId = 't1') => item('item/completed', { type: 'agentMessage', id: `m-${text}`, text }, threadId)
const command = (id: string, command: string, threadId = 't1') => item('item/started', { type: 'commandExecution', id, command, status: 'inProgress' }, threadId)
const commandDone = (id: string, aggregatedOutput: string, exitCode = 0, threadId = 't1') =>
  item('item/completed', { type: 'commandExecution', id, command: '', status: exitCode === 0 ? 'completed' : 'failed', aggregatedOutput, exitCode }, threadId)
const change = (id: string, path: string, kind = 'update') => item('item/started', { type: 'fileChange', id, changes: [{ path, kind: { type: kind }, diff: '' }], status: 'inProgress' })
const changeDone = (id: string, path: string, diff: string, kind = 'update') => item('item/completed', { type: 'fileChange', id, changes: [{ path, kind: { type: kind }, diff }], status: 'completed' })
const turnCompleted = (turn: Record<string, unknown> = {}, threadId = 't1') => ({ method: 'turn/completed', params: { threadId, turn: { id: 'u1', status: 'completed', items: [], error: null, ...turn } } })

test('a codex turn becomes one step per command and file change, with codex words before each, and its last word handed back', async ($, on) => {
  const requests = relay(on, {
    events: [
      [said('Looking around.'), command('c1', "/bin/zsh -lc 'ls -la'")],
      [commandDone('c1', 'README.md\n')],
      [said('Now the note.'), change('f1', '/work/note.txt')],
      [changeDone('f1', '/work/note.txt', '@@ -1 +1 @@\n-old line\n+new line\n')],
      [said('Changed note.txt.'), turnCompleted()],
    ],
  })
  const { rows, step, act } = subagent(on)
  await start($, on)
  rows.push(user('tidy the note'))

  const first = await step($)
  expect(first).toEqual({ text: 'Looking around.', tool: COMMAND, input: { command: 'ls -la', item_id: 'c1' }, stopReason: 'tool_use' })
  expect(await act($, first)).toEqual({ result: 'README.md' })

  const second = await step($)
  expect(second).toEqual({ text: 'Now the note.', tool: FILE_CHANGE, input: { path: 'note.txt', kind: 'update', item_id: 'f1' }, stopReason: 'tool_use' })
  expect(await act($, second)).toEqual({ result: 'Added 1 line, removed 1 line' })

  const last = await step($)
  expect(last).toEqual({ text: '', tool: HANDBACK, input: { message: 'Changed note.txt.' }, stopReason: 'tool_use' })
  await act($, last)

  expect(await step($)).toEqual({ text: '', stopReason: 'end_turn' })
  expect(requests.find(r => r.method === 'thread/start')?.params).toEqual({
    model: 'gpt-6-luna',
    cwd: '/work',
    approvalPolicy: 'never',
    sandbox: 'workspace-write',
    config: { 'sandbox_workspace_write.network_access': true },
    ephemeral: false,
  })
  expect(requests.find(r => r.method === 'turn/start')?.params).toMatchObject({ threadId: 't1', input: [{ type: 'text', text: 'tidy the note' }] })
})

test('the words codex said before its last are text of the handback step', async ($, on) => {
  relay(on, { events: [[said('Checked.'), said('All good.'), turnCompleted()]] })
  const { rows, step } = subagent(on)
  await start($, on)
  rows.push(user('check'))

  expect(await step($)).toEqual({ text: 'Checked.', tool: HANDBACK, input: { message: 'All good.' }, stopReason: 'tool_use' })
})

test('a command that exits non-zero is a failed call whose text starts with its exit code', async ($, on) => {
  relay(on, { events: [[command('c1', 'cat missing.txt')], [commandDone('c1', 'cat: missing.txt: No such file or directory\n', 1)]] })
  const { rows, step, act } = subagent(on)
  await start($, on)
  rows.push(user('read it'))

  expect(await act($, await step($))).toEqual({ deny: 'Exit code 1\ncat: missing.txt: No such file or directory' })
})

test('a command with no output answers (No output), as Claude Bash does', async ($, on) => {
  relay(on, { events: [[command('c1', 'true')], [commandDone('c1', '')]] })
  const { rows, step, act } = subagent(on)
  await start($, on)
  rows.push(user('run'))

  expect(await act($, await step($))).toEqual({ result: '(No output)' })
})

test('a command output loses the escape sequences that would move the cursor or retitle the terminal', async ($, on) => {
  relay(on, { events: [[command('c1', 'show')], [commandDone('c1', '\x1b[31mred\x1b[0m\n\x1b]0;title\x07plain\tcell\n')]] })
  const { rows, step, act } = subagent(on)
  await start($, on)
  rows.push(user('show'))

  expect(await act($, await step($))).toEqual({ result: 'red\nplain\tcell' })
})

test('a new file counts its lines as added', async ($, on) => {
  relay(on, { events: [[change('f1', '/work/a.txt', 'add')], [changeDone('f1', '/work/a.txt', 'one\ntwo\n', 'add')]] })
  const { rows, step, act } = subagent(on)
  await start($, on)
  rows.push(user('write'))

  const s = await step($)
  expect(s.input).toEqual({ path: 'a.txt', kind: 'add', item_id: 'f1' })
  expect(await act($, s)).toEqual({ result: 'Added 2 lines, removed 0 lines' })
})

test('a failed codex turn is handed back as a failure carrying codex error', async ($, on) => {
  relay(on, { events: [[turnCompleted({ status: 'failed', error: { message: 'model not available for this account' } })]] })
  const { rows, step } = subagent(on)
  await start($, on)
  rows.push(user('p'))

  const message = String((await step($)).input?.message)
  expect(message).toContain('failed')
  expect(message).toContain('model not available for this account')
})

test('codex refusing to start the thread is handed back as a failure, and no model is asked', async ($, on) => {
  relay(on, { answers: { 'thread/start': { error: { code: -32600, message: 'unknown model gpt-6-luna' } } } })
  const { rows, step, passed } = subagent(on)
  await start($, on)
  rows.push(user('p'))

  const s = await step($)
  expect(s.tool).toBe(HANDBACK)
  expect(String(s.input?.message)).toContain('unknown model gpt-6-luna')
  expect(passed).toEqual([])
})

test('a resumed codex subagent starts the next turn in the same thread with the message it was sent', async ($, on) => {
  let turns = 0
  const requests = relay(on, {
    answers: { 'turn/start': () => ({ result: { turn: { id: `u${++turns}` } } }) },
    events: [[said('a'), turnCompleted({ id: 'u1' })], [said('fixed'), turnCompleted({ id: 'u2' })]],
  })
  const { rows, step, act } = subagent(on)
  await start($, on)
  rows.push(user('find bugs'))
  await act($, await step($))
  expect((await step($)).stopReason).toBe('end_turn')

  rows.push(user('now fix them'))
  expect((await step($)).input).toEqual({ message: 'fixed' })
  expect(requests.filter(r => r.method === 'thread/start')).toHaveLength(1)
  expect(requests.filter(r => r.method === 'turn/start').map(r => r.params)).toMatchObject([{ threadId: 't1' }, { threadId: 't1', input: [{ text: 'now fix them' }] }])
})

for (const [who, options, isMain] of [
  ['the main loop', {}, true],
  ['a subagent of another type', { type: 'general-purpose' }, false],
] as const) {
  test(`a step of ${who} goes on to the model`, async ($, on) => {
    relay(on)
    const { rows, step, passed } = subagent(on, options)
    await start($, on)
    rows.push(user('p'))

    expect(await step($, isMain)).toEqual({ text: '', stopReason: '' })
    expect(passed).toHaveLength(1)
  })
}

test('an item tool called outside a codex subagent is refused and starts no thread', async ($, on) => {
  const requests = relay(on)
  agents(on, [{ id: 'a1', type: 'general-purpose' }])
  await start($, on)

  expect(await $.tool.call({ tool: COMMAND, command: 'ls', item_id: 'c1', agentId: 'a1' })).toMatchObject({ deny: expect.stringContaining('codex-subagent:') })
  expect(await $.tool.call({ tool: FILE_CHANGE, path: 'a', kind: 'add', item_id: 'f1' })).toMatchObject({ deny: expect.any(String) })
  expect(requests.map(r => r.method)).not.toContain('thread/start')
})

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
    const requests = relay(on, { events: [[turnCompleted()]] })
    const { rows, step } = subagent(on, { type: 'codex-subagent:gpt-6-1-sol' })
    coreAnswersAgent(on)
    await start($, on)

    await agentCall($, { subagent_type: 'codex-subagent:gpt-6-1-sol', ...(given && { effort: given }) })
    rows.push(user('p'))
    await step($)

    expect(requests.find(r => r.method === 'turn/start')?.params?.effort).toBe(sent)
  })
}

test('a codex subagent Claude Code put in a worktree runs its codex thread there', async ($, on) => {
  const requests = relay(on, { events: [[turnCompleted()]] })
  const { rows, step } = subagent(on)
  coreAnswersAgent(on)
  // Inside the subagent's own step, the session's directory is its worktree.
  await start($, on, '/repo/.claude/worktrees/agent-a1')

  await agentCall($, { subagent_type: 'codex-subagent:gpt-6-luna', isolation: 'worktree' })
  rows.push(user('p'))
  await step($)

  expect(requests.find(r => r.method === 'thread/start')?.params?.cwd).toBe('/repo/.claude/worktrees/agent-a1')
})

test('a request codex sends is answered with an error so the turn does not stall', async ($, on) => {
  const sent: unknown[] = []
  on('http.fetch', { url: 'http://relay/send' }, (_, e) => (sent.push(JSON.parse(e.init!.body!)), ok({})))
  relay(on, { events: [[{ id: 7, method: 'item/tool/requestUserInput', params: {} }, turnCompleted()]] })
  const { rows, step } = subagent(on)
  await start($, on)
  rows.push(user('p'))

  await step($)

  expect(sent).toContainEqual({ id: 7, error: expect.objectContaining({ code: -32601 }) })
})

test('two codex subagents at once each get their own items, whichever call polled them', async ($, on) => {
  let threads = 0
  relay(on, {
    answers: {
      'thread/start': () => ({ result: { thread: { id: `t${++threads}` } } }),
      'turn/start': (params: Record<string, unknown>) => ({ result: { turn: { id: `u-${params.threadId}` } } }),
    },
    events: [[], [said('from two', 't2'), turnCompleted({ id: 'u-t2' }, 't2'), said('from one', 't1'), turnCompleted({ id: 'u-t1' }, 't1')]],
  })
  const rows: Record<string, Row[]> = { a1: [user('p')], a2: [user('p')] }
  on('session.messages', (_, e) => ({ value: rows[String(e.agentId)] ?? [] }))
  agents(on, [
    { id: 'a1', type: 'codex-subagent:gpt-6-luna' },
    { id: 'a2', type: 'codex-subagent:gpt-6-luna' },
  ])
  await start($, on)

  const handback = async (agentId: string) => {
    let input = ''
    for await (const chunk of $.turn.step({ turnId: 't', index: 0, model: 'm', messageCount: 1, agentId }) as AsyncIterable<{ kind: string; json?: string }>)
      if (chunk.kind === 'input') input += chunk.json
    return JSON.parse(input).message
  }

  expect(await Promise.all([handback('a1'), handback('a2')])).toEqual(['from one', 'from two'])
})

// Settling the call above the mod abandons the dispatch beneath it, as a TaskStop does.
const stopper = {
  name: 'stopper',
  tier: 'prepend' as const,
  register(on: On) {
    on('tool.call', { tool: 'mcp__codex-subagent__command' }, async ($, e, next) => {
      void next(e)
      await $.clock.sleep(20)
      return { result: 'stopped' }
    })
  },
}

test('an item tool call whose dispatch is abandoned interrupts the codex turn', { plugins: [stopper] }, async ($, on) => {
  const interrupted: unknown[] = []
  let release = () => {}
  let polls = 0
  on('http.fetch', { url: 'http://relay/events' }, async () => {
    if (polls++ === 0) return ok({ events: [command('c1', 'sleep 90')] })
    await new Promise<void>(resolve => (release = resolve))
    return ok({ events: [turnCompleted({ status: 'interrupted' })] })
  })
  relay(on, { answers: { 'turn/interrupt': (params: unknown) => (interrupted.push(params), release(), { result: {} }) } })
  const { rows, step } = subagent(on)
  const clock = mock.clock(on)
  await start($, on)
  rows.push(user('p'))

  const s = await step($)
  const call = $.tool.call({ tool: s.tool!, ...s.input, agentId: 'a1' })
  await clock.advance(20)
  expect(await call).toEqual({ result: 'stopped' })
  await clock.settle()
  expect(interrupted).toEqual([{ threadId: 't1', turnId: 'u1' }])
})

const sendTo = ($: $, text: string) => $.session.receive({ origin: { kind: 'coordinator' }, text, agentId: 'a1' })

test('a message a codex subagent receives while its codex turn runs is steered into that turn', async ($, on) => {
  const steered: unknown[] = []
  const requests = relay(on, {
    answers: { 'turn/steer': (params: unknown) => (steered.push(params), { result: { turnId: 'u1' } }) },
    events: [[command('c1', 'sleep 30')], [commandDone('c1', '')], [said('ALPHA BRAVO'), turnCompleted()]],
  })
  on('session.receive', (_, e) => ({ text: e.text }))
  const { rows, step, act } = subagent(on)
  await start($, on)
  rows.push(user('say ALPHA'))
  await act($, await step($))

  expect(await sendTo($, 'add BRAVO')).toMatchObject({ consumed: expect.any(String) })
  expect(steered).toEqual([{ threadId: 't1', input: [{ type: 'text', text: 'add BRAVO', text_elements: [] }], expectedTurnId: 'u1' }])
  expect((await step($)).input).toEqual({ message: 'ALPHA BRAVO' })
  expect(requests.filter(r => r.method === 'turn/start')).toHaveLength(1)
})

test('a message that comes after the codex turn ended goes to codex as one more turn before the handback', async ($, on) => {
  let turns = 0
  const requests = relay(on, {
    answers: {
      'turn/start': () => ({ result: { turn: { id: `u${++turns}` } } }),
      'turn/steer': { error: { code: -32600, message: 'no active turn' } },
    },
    events: [[command('c1', 'echo ALPHA')], [commandDone('c1', 'ALPHA\n'), said('ALPHA'), turnCompleted({ id: 'u1' })], [said('ALPHA BRAVO'), turnCompleted({ id: 'u2' })]],
  })
  on('session.receive', (_, e) => ({ text: e.text }))
  const { rows, step, act } = subagent(on)
  await start($, on)
  rows.push(user('say ALPHA'))
  await act($, await step($))

  expect(await sendTo($, 'add BRAVO')).toMatchObject({ consumed: expect.any(String) })
  expect(await step($)).toMatchObject({ tool: HANDBACK, input: { message: 'ALPHA BRAVO' } })
  expect(requests.filter(r => r.method === 'turn/start').map(r => r.params)).toMatchObject([{ threadId: 't1' }, { threadId: 't1', input: [{ text: 'add BRAVO' }] }])
})

const prompted = ($: $, text: string, isMeta?: true) =>
  $.session.append({ message: { type: 'user', role: 'user', content: [{ type: 'text', text }], ...(isMeta && { isMeta }) }, door: 'prompt', origin: { kind: 'coordinator' }, uuid: crypto.randomUUID(), agentId: 'a1' })

test('a message Claude Code writes into the transcript at the handback goes to codex as one more turn and is handed back too', async ($, on) => {
  let turns = 0
  const requests = relay(on, {
    answers: { 'turn/start': () => ({ result: { turn: { id: `u${++turns}` } } }) },
    events: [[said('ALPHA'), turnCompleted({ id: 'u1' })], [said('ALPHA BRAVO'), turnCompleted({ id: 'u2' })]],
  })
  const { rows, step, act } = subagent(on)
  await start($, on)
  await prompted($, 'say ALPHA')
  rows.push(user('say ALPHA'))
  await act($, await step($))

  await prompted($, 'The coordinator sent a message while you were working:\nadd BRAVO', true)
  const next = await step($)
  expect(next).toMatchObject({ tool: HANDBACK, input: { message: 'ALPHA BRAVO' } })
  await act($, next)
  expect((await step($)).stopReason).toBe('end_turn')
  expect(requests.filter(r => r.method === 'turn/start').map(r => r.params)).toMatchObject([
    { threadId: 't1', input: [{ text: 'say ALPHA' }] },
    { threadId: 't1', input: [{ text: 'The coordinator sent a message while you were working:\nadd BRAVO' }] },
  ])
})

test('a message sent to a finished codex subagent is queued, so Claude Code resumes it with the message', async ($, on) => {
  relay(on)
  on('session.receive', (_, e) => ({ text: e.text }))
  subagent(on, { status: 'completed' })
  await start($, on)

  expect(await sendTo($, 'add BRAVO')).toEqual({ text: 'add BRAVO' })
})

const row = (tool: string, input: Record<string, unknown>, more: Record<string, unknown> = {}) => ({
  plugin: 'codex-subagent',
  surface: 'terminal' as const,
  component: 'ToolUse' as const,
  requestId: 'r1',
  viewport: { columns: 100, rows: 40 },
  props: { tool_use_id: 'r1', tool, input, isRunning: false, isErrored: false, isInterrupted: false, ...more },
})

const drawnText = async ($: $, target: ReturnType<typeof row>) => {
  const ui = await $.ui.mount(target as never)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  await ui.unmount()
  return texts
}

test('a command row is drawn as Claude draws a Bash row, with Running under it while it runs', async ($, on) => {
  relay(on)
  await start($, on)

  expect(await drawnText($, row(COMMAND, { command: 'ls -la', item_id: 'c1' }))).toContain('⏺ Bash(ls -la)')
  expect(await drawnText($, row(COMMAND, { command: 'sleep 9', item_id: 'c1' }, { isRunning: true }))).toEqual(expect.arrayContaining(['⏺ Bash(sleep 9)', '  ⎿  Running…']))
})

test('a file change row is drawn as Update, Write or Delete of its path', async ($, on) => {
  relay(on)
  await start($, on)

  expect(await drawnText($, row(FILE_CHANGE, { path: 'note.txt', kind: 'update', item_id: 'f1' }))).toContain('⏺ Update(note.txt)')
  expect(await drawnText($, row(FILE_CHANGE, { path: 'a.txt', kind: 'add', item_id: 'f1' }))).toContain('⏺ Write(a.txt)')
  expect(await drawnText($, row(FILE_CHANGE, { path: 'b.txt', kind: 'delete', item_id: 'f1' }))).toContain('⏺ Delete(b.txt)')
})

test('a row of codex waiting on its child is drawn as Wait of the child', async ($, on) => {
  relay(on)
  await start($, on)

  expect(await drawnText($, row(WAIT, { agent: 'echo_nested', item_id: 'sa-done' }))).toContain('⏺ Wait(echo_nested)')
})

test('a row drops escape sequences and puts a many-line command on one line', async ($, on) => {
  relay(on)
  await start($, on)

  expect(await drawnText($, row(COMMAND, { command: 'echo \x1b]0;pwned\x07hi &&\n  ls', item_id: 'c1' }))).toContain('⏺ Bash(echo hi && ls)')
})

test('a row of another tool is left to Claude Code', async ($, on) => {
  relay(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await start($, on)

  expect(await drawnText($, row('Bash', { command: 'ls' }))).toEqual(['engine'])
})

const LUNA = 'codex-subagent:gpt-6-luna'
// codex says a child started on both item/started and item/completed.
const childStarted = (threadId: string, agentPath = '/root/echo_nested') =>
  (['item/started', 'item/completed'] as const).map(method => item(method, { type: 'subAgentActivity', id: `sa-${threadId}`, kind: 'started', agentThreadId: threadId, agentPath }))

const family = (on: On, others: { id: string; type: string }[] = []) => {
  const rows: Record<string, Row[]> = { a1: [user('ask a child')], a2: [] }
  on('session.messages', (_, e) => ({ value: rows[String(e.agentId)] ?? [] }))
  const child = { id: 'a2', type: LUNA, status: 'running' as AgentStatus }
  agents(on, [{ id: 'a1', type: LUNA }, child, ...others])
  const answer = (agentId: string, s: Step, result: string) => rows[agentId]!.push(called(`x${rows[agentId]!.length}`, s.tool!), answered(`x${rows[agentId]!.length}`, result))
  return { rows, answer, child }
}

test('codex starting its own subagent makes the parent codex subagent call Agent once, in the background with its own type', async ($, on) => {
  relay(on, { events: [childStarted('t2'), [said('the child said hi'), turnCompleted()]] })
  const { answer } = family(on)
  await start($, on)

  const spawn = await stepAs($, 'a1')
  expect(spawn).toEqual({
    text: '',
    tool: 'Agent',
    input: { subagent_type: LUNA, description: 'codex echo_nested', prompt: 'codex child thread t2\n\n/root/echo_nested', run_in_background: true },
    stopReason: 'tool_use',
  })
  answer('a1', spawn, 'async_launched')
  expect(await stepAs($, 'a1')).toMatchObject({ tool: HANDBACK, input: { message: 'the child said hi' } })
})

test('the Agent call for a codex child is allowed only inside the codex subagent that made it, and every other is left to the check', async ($, on) => {
  relay(on, { events: [childStarted('t2')] })
  family(on, [{ id: 'g1', type: 'general-purpose' }])
  on('tool.check', () => ({ decision: 'ask' as const }))
  await start($, on)
  const { input } = await stepAs($, 'a1')
  const check = (agentId: string | undefined, prompt: string) => $.tool.check({ tool: 'Agent', input: { ...input, prompt }, ...(agentId && { agentId }) })

  expect(await check('a1', String(input?.prompt))).toMatchObject({ decision: 'allow' })
  expect(await check('a1', 'codex child thread t9\n\n/root/other')).toMatchObject({ decision: 'ask' })
  expect(await check(undefined, String(input?.prompt))).toMatchObject({ decision: 'ask' })
  expect(await check('g1', String(input?.prompt))).toMatchObject({ decision: 'ask' })
})

test('a codex child subagent takes its thread from its prompt, starts no codex turn, and shows the child items until its handback', async ($, on) => {
  const requests = relay(on, {
    events: [[...childStarted('t2'), command('c1', 'echo nested-ok', 't2')], [commandDone('c1', 'nested-ok\n', 0, 't2')], [said('nested-ok', 't2'), turnCompleted({ id: 'u9' }, 't2')]],
  })
  const { rows, answer } = family(on)
  await start($, on)
  const spawn = await stepAs($, 'a1')
  rows.a2!.push(user(String(spawn.input?.prompt)))

  const first = await stepAs($, 'a2')
  expect(first).toMatchObject({ tool: COMMAND, input: { command: 'echo nested-ok', item_id: 'c1' } })
  expect(await $.tool.call({ tool: COMMAND, ...first.input, agentId: 'a2' })).toEqual({ result: 'nested-ok' })
  answer('a2', first, 'nested-ok')
  expect(await stepAs($, 'a2')).toMatchObject({ tool: HANDBACK, input: { message: 'nested-ok' } })
  expect(requests.filter(r => r.method === 'turn/start').map(r => r.params?.threadId)).toEqual(['t1'])
})

test('a codex child result that would wake its finished parent is refused, and other resumes go on', async ($, on) => {
  relay(on, { events: [childStarted('t2'), [turnCompleted({ id: 'u9' }, 't2')]] })
  const { rows } = family(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet', agentId: 'a1' }))
  await start($, on)
  const spawn = await stepAs($, 'a1')
  rows.a2!.push(user(String(spawn.input?.prompt)))
  await stepAs($, 'a2')
  const wake = (prompt: string) =>
    $.agent.spawn({ tool_use_id: 'w', prompt, description: 'd', subagentType: LUNA, provider: { plugin: 'codex-subagent', tier: 'user' }, parentModel: 'claude-sonnet', background: true, fork: false, resume: { agentId: 'a1' } })

  expect(await wake('<agent-message from="a2">\nnested-ok\n</agent-message>')).toMatchObject({ deny: expect.any(String) })
  expect(await wake('<task-notification>\n<task-id>a2</task-id>\n<status>completed</status>\n</task-notification>')).toMatchObject({ deny: expect.any(String) })
  expect(await wake('now fix them')).toEqual({ model: 'claude-sonnet', agentId: 'a1' })
})

test('codex seeing its child end is a step of the parent, answered only once the child subagent has ended', async ($, on) => {
  const childEnded = (['item/started', 'item/completed'] as const).map(method =>
    item(method, { type: 'subAgentActivity', id: 'sa-done', kind: 'completed', agentThreadId: 't2', agentPath: '/root/echo_nested' }),
  )
  relay(on, { events: [childStarted('t2'), [turnCompleted({ id: 'u9' }, 't2'), ...childEnded]] })
  const { rows, answer, child } = family(on)
  const clock = mock.clock(on)
  await start($, on)
  const spawn = await stepAs($, 'a1')
  answer('a1', spawn, 'async_launched')
  rows.a2!.push(user(String(spawn.input?.prompt)))
  await stepAs($, 'a2')

  const wait = await stepAs($, 'a1')
  expect(wait).toMatchObject({ tool: WAIT, input: { agent: 'echo_nested', item_id: 'sa-done' } })
  let settled = false
  const call = $.tool.call({ tool: WAIT, ...wait.input, agentId: 'a1' }).finally(() => (settled = true))
  await clock.advance(500)
  expect(settled).toBe(false)
  child.status = 'completed'
  await clock.advance(500)
  expect(await call).toEqual({ result: 'finished' })
})
