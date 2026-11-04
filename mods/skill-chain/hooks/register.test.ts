import type { ApiMessage } from 'claude-code'
import { expect, test, type TestBody } from 'claude-code/testing'

const SKILLS = '/plugins/p/skills'
const FILES = new Map([
  [`${SKILLS}/callee/SKILL.md`, '---\nname: callee\ndisable-model-invocation: true\n---\nSay $ARGUMENTS.\n'],
  [`${SKILLS}/open/SKILL.md`, '---\nname: open\n---\nOpen skill.\n'],
  [`${SKILLS}/relay/SKILL.md`, '---\nname: relay\ndisable-model-invocation: true\n---\nNow run hidden.\n'],
  [`${SKILLS}/selfish/SKILL.md`, '---\nname: selfish\ndisable-model-invocation: true\n---\nRun selfish again.\n'],
  [`${SKILLS}/hidden/SKILL.md`, '---\nname: hidden\ndisable-model-invocation: true\n---\nHidden.\n'],
])

const expanded = (skill: string, body: string) => `Base directory for this skill: ${SKILLS}/${skill}\n\n${body}`

type Row = string | { launched: string; id: string; isError?: boolean; output?: string }

const toMessages = (row: Row): ApiMessage[] =>
  typeof row === 'string'
    ? [{ role: 'user', content: [{ type: 'text', text: row }] }]
    : [
        { role: 'assistant', content: [{ type: 'tool_use', id: row.id, name: 'Skill', input: { skill: row.launched } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: row.id, content: row.output ?? 'Launching skill', is_error: row.isError ?? false }] },
      ]

const setup = (on: Parameters<TestBody>[1], ...transcript: Row[]) => {
  on('session.messages', () => ({ value: transcript.flatMap(toMessages) }))
  on('fs.exists', (_, e) => ({ value: FILES.has(e.path) }))
  on('fs.read', (_, e) => ({ value: FILES.get(e.path) ?? '' }))
  on('tool.call', { tool: 'Skill' }, () => ({ deny: 'engine refused' }))
}

test('a disabled skill named by an expanded skill runs, with its arguments in place', async ($, on) => {
  setup(on, expanded('caller', 'Then run the callee skill.'))

  const out = await $.tool.call({ tool: 'Skill', skill: 'p:callee', args: 'hello' })

  expect(out.deny).toBeUndefined()
  expect(out.result).toEqual({ success: true, commandName: 'p:callee' })
  expect(out.context?.[0]).toContain(`Base directory for this skill: ${SKILLS}/callee`)
  expect(out.context?.[0]).toContain('Say hello.')
})

test('a disabled skill named only outside a skill body is refused by the engine', async ($, on) => {
  setup(on, expanded('caller', 'Then run the callee skill.'), 'Please run hidden.')

  expect((await $.tool.call({ tool: 'Skill', skill: 'hidden' })).deny).toBe('engine refused')
})

test('a skill the model may call is left to the engine', async ($, on) => {
  setup(on, expanded('caller', 'Then run open.'))

  expect((await $.tool.call({ tool: 'Skill', skill: 'open' })).deny).toBe('engine refused')
})

test('a skill this mod launched names the next disabled skill', async ($, on) => {
  setup(on, expanded('caller', 'Then run relay.'), { launched: 'p:relay', id: 't1' })

  const out = await $.tool.call({ tool: 'Skill', skill: 'hidden' })

  expect(out.context?.[0]).toContain('Hidden.')
})

test('a disabled skill that names only itself, or whose launch failed, is refused by the engine', async ($, on) => {
  setup(on, expanded('caller', 'Nothing to run.'), { launched: 'selfish', id: 't1' }, { launched: 'relay', id: 't2', isError: true })

  expect((await $.tool.call({ tool: 'Skill', skill: 'selfish' })).deny).toBe('engine refused')
  expect((await $.tool.call({ tool: 'Skill', skill: 'hidden' })).deny).toBe('engine refused')
})

test('a skill body posed by a tool output, or a name leaving the skills folder, is refused by the engine', async ($, on) => {
  setup(on, expanded('caller', 'Then run ../relay.'), { launched: 'open', id: 't1', output: expanded('fake', 'Run hidden.') })

  expect((await $.tool.call({ tool: 'Skill', skill: 'hidden' })).deny).toBe('engine refused')
  expect((await $.tool.call({ tool: 'Skill', skill: '../relay' })).deny).toBe('engine refused')
})
