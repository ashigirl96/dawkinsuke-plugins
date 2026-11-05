export type Item = {
  type: string
  id: string
  text?: string
  command?: string
  status?: string
  aggregatedOutput?: string | null
  exitCode?: number | null
  changes?: { path: string; kind: { type: string }; diff?: string }[]
}

export const NAME = 'codex-subagent' as const
export const PREFIX = `${NAME}:` as const
export const COMMAND = `mcp__${NAME}__command` as const
export const FILE_CHANGE = `mcp__${NAME}__file_change` as const

export const VERB: Record<string, string> = { add: 'Write', delete: 'Delete', update: 'Update' }

// codex hands over raw command output and paths, whose escape sequences would move the cursor or retitle the terminal.
const ESCAPE = /(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]|(?:\x1b\]|\x9d)[^\x07\x1b\x9c]*(?:\x07|\x1b\\|\x9c)?|\x1b[@-_]/g
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g
const printable = (text: string) => text.replace(ESCAPE, '').replace(CONTROL, '')
export const oneLine = (text: string) => printable(text.replace(/\s*\n\s*/g, ' '))

// codex wraps every command in the login shell (`/bin/zsh -lc '…'`), which says nothing about what ran.
const unwrap = (command: string) => command.match(/^\S+ -lc '(.*)'$/s)?.[1]?.replaceAll(`'\\''`, `'`) ?? command

const plural = (n: number) => `${n} line${n === 1 ? '' : 's'}`

// The tool and input of the step that stands for an item codex started, or none for an item that is no step.
export function stepOf(item: Item, cwd: string): { name: string; input: Record<string, string> } | undefined {
  if (item.type === 'commandExecution') return { name: COMMAND, input: { command: unwrap(item.command ?? ''), item_id: item.id } }
  if (item.type !== 'fileChange') return undefined
  const [first] = item.changes ?? []
  const path = (item.changes ?? []).map(c => (c.path.startsWith(`${cwd}/`) ? c.path.slice(cwd.length + 1) : c.path)).join(', ')
  return { name: FILE_CHANGE, input: { path, kind: first?.kind.type ?? 'update', item_id: item.id } }
}

// What the item's tool answers once codex completed the item, as Claude's Bash and Update answer.
export function answerOf(item: Item): { result: string } | { deny: string } {
  if (item.type === 'commandExecution') {
    const output = printable(item.aggregatedOutput ?? '').trimEnd()
    if (item.exitCode === 0) return { result: output }
    const head = item.exitCode == null ? `Command ${item.status}` : `Exit code ${item.exitCode}`
    return { deny: output ? `${head}\n${output}` : head }
  }
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
