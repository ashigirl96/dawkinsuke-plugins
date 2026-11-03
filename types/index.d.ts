export type Term = { term: string; ja: string; en: string; nuance: string; codebase: string }
export type Mode = 'ascii' | 'off'
export type Rendered = { kind: 'ascii'; text: string }

declare module 'claude-code' {
  interface PluginState {
    dawkinsuke: {
      'glossary.terms': Shaped<Term[]>
      'glossary.pending': Shaped<string[]>
      'glossary.open': Shaped<string | null>
      'mermaid-render.mode': Mode
      'mermaid-render.rendered': Record<string, Rendered>
    }
  }
}
