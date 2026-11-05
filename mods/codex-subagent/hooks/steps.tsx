import { update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

export type Item = {
  type: string
  id: string
  command?: string
  status?: string
  aggregatedOutput?: string | null
  exitCode?: number | null
  changes?: { path: string; kind: { type: string } }[]
}

const TAIL = 3
const VERB: Record<string, string> = { add: 'Write', delete: 'Delete', update: 'Update' }

export const NAME = 'codex-subagent'
export const PREFIX = `${NAME}:`

// The engine's scan reads a state reference only as literals, so the name is spelled out again here.
const steps = { plugin: 'codex-subagent', key: 'steps' } as const

// codex hands over raw command output and paths, whose escape sequences would move the cursor or retitle the terminal.
const ESCAPE = /(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]|(?:\x1b\]|\x9d)[^\x07\x1b\x9c]*(?:\x07|\x1b\\|\x9c)?|\x1b[@-_]/g
const CONTROL = /[\x00-\x1f\x7f-\x9f]/g
const printable = (text: string) => text.replace(ESCAPE, '').replace(CONTROL, '')

// codex wraps every command in the login shell (`/bin/zsh -lc '…'`), which says nothing about what ran.
const unwrap = (command: string) => command.match(/^\S+ -lc '(.*)'$/s)?.[1]?.replaceAll(`'\\''`, `'`) ?? command

function linesOf(item: Item): string[] | undefined {
  if (item.type === 'commandExecution') {
    const tail = (item.aggregatedOutput ?? '').split('\n').map(printable).filter(Boolean).slice(-TAIL)
    const detail = item.status === 'inProgress' ? 'running…' : item.exitCode == null ? printable(item.status ?? '') : [`exit ${item.exitCode}`, ...tail].join(' · ')
    return [`⎿  Bash(${printable(unwrap(item.command ?? '').replace(/\s*\n\s*/g, ' '))})`, `   ${detail}`]
  }
  if (item.type === 'fileChange') {
    const lines = (item.changes ?? []).map(change => `⎿  ${VERB[change.kind.type] ?? 'Update'}(${printable(change.path)})`)
    return item.status === 'failed' || item.status === 'declined' ? [...lines, `   ${item.status}`] : lines
  }
  return undefined
}

export async function storeStep($: EngineInterface, agentId: string, item: Item) {
  const lines = linesOf(item)
  if (!lines) return undefined
  await update($, { ...steps, id: agentId }, (list = []) =>
    list.some(step => step.id === item.id) ? list.map(step => (step.id === item.id ? { id: item.id, lines } : step)) : [...list, { id: item.id, lines }],
  )
  return lines
}
