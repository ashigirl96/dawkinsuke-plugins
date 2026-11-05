export type Step = { id: string; lines: string[] }

declare module 'claude-code' {
  interface PluginState {
    'codex-subagent': { steps: StateFamily<Step[]> }
  }
}
