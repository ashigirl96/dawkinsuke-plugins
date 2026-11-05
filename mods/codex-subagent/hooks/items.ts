export type Item = {
  type: string
  id: string
  text?: string
  command?: string
  status?: string
  aggregatedOutput?: string | null
  exitCode?: number | null
  changes?: { path: string; kind: { type: string }; diff?: string }[]
  kind?: string
  agentThreadId?: string
  agentPath?: string
}

type Answer = { result: string } | { deny: string }
export type RowInput = { command?: string; path?: string; kind?: string; agent?: string }
type Row = [name: string, argument: string]

export const NAME = 'codex-subagent' as const
export const PREFIX = `${NAME}:` as const

// codex hands over raw command output and paths, whose escape sequences would move the cursor or retitle the terminal.
const ESCAPE = /(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]|(?:\x1b\]|\x9d)[^\x07\x1b\x9c]*(?:\x07|\x1b\\|\x9c)?|\x1b[@-_]/g
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g
const printable = (text: string) => text.replace(ESCAPE, '').replace(CONTROL, '')
export const oneLine = (text: string) => printable(text.replace(/\s*\n\s*/g, ' '))

// codex wraps every command in the login shell (`/bin/zsh -lc '…'`), which says nothing about what ran.
const unwrap = (command: string) => command.match(/^\S+ -lc '(.*)'$/s)?.[1]?.replaceAll(`'\\''`, `'`) ?? command

const plural = (n: number) => `${n} line${n === 1 ? '' : 's'}`

const VERB: Record<string, string> = { add: 'Write', delete: 'Delete', update: 'Update' }

function commandAnswer(item: Item): Answer {
  const output = printable(item.aggregatedOutput ?? '').trimEnd()
  if (item.exitCode === 0) return { result: output || '(No output)' }
  const head = item.exitCode == null ? `Command ${item.status}` : `Exit code ${item.exitCode}`
  return { deny: output ? `${head}\n${output}` : head }
}

function fileChangeInput(item: Item, cwd: string) {
  const changes = item.changes ?? []
  const path = changes.map(c => (c.path.startsWith(`${cwd}/`) ? c.path.slice(cwd.length + 1) : c.path)).join(', ')
  return { path, kind: changes[0]?.kind.type ?? 'update' }
}

function fileChangeAnswer(item: Item): Answer {
  if (item.status !== 'completed') return { deny: `File change ${item.status}` }
  let added = 0
  let removed = 0
  for (const change of item.changes ?? []) {
    const lines = (change.diff ?? '').split('\n').filter(Boolean)
    // An added or deleted file's diff is its content, not a unified diff.
    if (change.kind.type === 'add') added += lines.length
    else if (change.kind.type === 'delete') removed += lines.length
    else {
      added += lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length
      removed += lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length
    }
  }
  return { result: `Added ${plural(added)}, removed ${plural(removed)}` }
}

export const KINDS = [
  {
    is: (item: Item) => item.type === 'commandExecution',
    name: 'command',
    tool: `mcp__${NAME}__command`,
    description: 'Shows a command codex runs and answers with its output once codex finished it.',
    input: ['command'],
    inputOf: (item: Item, _cwd: string): Record<string, string> => ({ command: unwrap(item.command ?? '') }),
    answerOf: commandAnswer,
    rowOf: (input: RowInput): Row => ['Bash', input.command ?? ''],
  },
  {
    is: (item: Item) => item.type === 'fileChange',
    name: 'file_change',
    tool: `mcp__${NAME}__file_change`,
    description: 'Shows a file change codex makes and answers with its size once codex made it.',
    input: ['path', 'kind'],
    inputOf: fileChangeInput,
    answerOf: fileChangeAnswer,
    rowOf: (input: RowInput): Row => [VERB[input.kind ?? ''] ?? 'Update', input.path ?? ''],
  },
  {
    is: (item: Item) => item.type === 'subAgentActivity' && item.kind === 'completed',
    name: 'wait',
    tool: `mcp__${NAME}__wait`,
    description: "Shows codex seeing one of its own subagents end and answers once that subagent's Claude Code subagent has ended too.",
    input: ['agent'],
    inputOf: (item: Item, _cwd: string): Record<string, string> => ({ agent: item.agentPath?.split('/').at(-1) ?? '' }),
    answerOf: (_item: Item): Answer => ({ result: 'finished' }),
    rowOf: (input: RowInput): Row => ['Wait', input.agent ?? ''],
  },
] as const

export const kindOfItem = (item: Item) => KINDS.find(kind => kind.is(item))
export const kindOfTool = (tool: string) => KINDS.find(kind => kind.tool === tool)

export const childThreadOf = (item: Item) => (item.type === 'subAgentActivity' && item.kind === 'started' ? item.agentThreadId : undefined)
