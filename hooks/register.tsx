import type { Register } from 'claude-code'
import { register as registerGlossary, start as startGlossary } from './glossary/register'
import { register as registerMermaid, start as startMermaid } from './mermaid-render/register'

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await startGlossary($)
    await startMermaid($)
    return next(e)
  })
  registerGlossary(on, options)
  registerMermaid(on, options)
}
