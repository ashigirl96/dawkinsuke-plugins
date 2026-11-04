import type { ApiMessage, Register } from 'claude-code'

type Block = { type?: string; text?: unknown; id?: string; tool_use_id?: string; name?: string; input?: { skill?: unknown }; is_error?: boolean }
type Skill = { name: string; dir: string; text: string }

const BASE_DIR = /^Base directory for this skill: (.+)$/gm
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
const DISABLED = /^disable-model-invocation:\s*true\s*$/m

const parentDir = (path: string) => path.slice(0, path.lastIndexOf('/'))
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const bareName = (skill: string) => skill.slice(skill.indexOf(':') + 1)
// A name with `/` or `..` would reach a SKILL.md outside the skills folder.
const isPlainName = (name: string) => /^[\w-]+$/.test(name)

const blocksOf = (content: unknown): Block[] =>
  typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : []

// A tool's output is left out: a file or command output could otherwise pose as a skill body and name any folder.
const userTextsOf = (m: ApiMessage): string[] =>
  m.role === 'user' ? blocksOf(m.content).flatMap(b => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])) : []

const withArgs = (body: string, args: string | undefined) =>
  body.includes('$ARGUMENTS')
    ? body.replaceAll('$ARGUMENTS', args ?? '')
    : args
      ? `${body}\n\nARGUMENTS: ${args}`
      : body

export const register: Register = on => {
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    // An organization's managed plugin may hide skill bodies from skill.prompt and session.append hooks; the transcript still holds them.
    const messages = await $.session.messages({ as: 'api', agentId: e.agentId })
    if ('deny' in messages) return next(e)

    const readSkill = async (path: string) => {
      const file = await $.fs.read(path)
      const frontmatter = file.match(FRONTMATTER)
      return { body: frontmatter ? file.slice(frontmatter[0].length) : file, isDisabled: !!frontmatter?.[1] && DISABLED.test(frontmatter[1]) }
    }

    const expanded: Skill[] = messages
      .flatMap(userTextsOf)
      .flatMap(text => [...text.matchAll(BASE_DIR)].map(([, dir]) => ({ name: baseName(dir!.trim()), dir: dir!.trim(), text })))
    const skillsDirs = [...new Set(expanded.map(s => parentDir(s.dir)))]

    const findSkill = async (name: string) => {
      for (const skillsDir of skillsDirs) {
        const path = `${skillsDir}/${name}/SKILL.md`
        if (await $.fs.exists(path)) return path
      }
    }

    // A body this hook answered with reaches the model as context, which the transcript does not hold: read it again from the skill's file.
    const blocks = messages.flatMap((m: ApiMessage) => blocksOf(m.content))
    const failed = new Set(blocks.filter(b => b.type === 'tool_result' && b.is_error).map(b => b.tool_use_id))
    const launched = blocks.flatMap(b =>
      b.type === 'tool_use' && b.name === 'Skill' && typeof b.input?.skill === 'string' && b.id !== e.tool_use_id && !failed.has(b.id)
        ? [bareName(b.input.skill)]
        : [],
    )
    for (const name of new Set(launched.filter(isPlainName))) {
      const path = await findSkill(name)
      if (path) expanded.push({ name, dir: parentDir(path), text: (await readSkill(path)).body })
    }

    // shortcut: a `plugin:` prefix is dropped, so the first skills folder holding the name wins; check the plugin if two plugins share a skill name.
    const name = bareName(e.skill)
    if (!isPlainName(name)) return next(e)
    const word = new RegExp(`(^|[^\\w-])${name}([^\\w-]|$)`)
    if (!expanded.some(s => s.name !== name && word.test(s.text))) return next(e)

    const path = await findSkill(name)
    if (!path) return next(e)
    const { body, isDisabled } = await readSkill(path)
    if (!isDisabled) return next(e)

    const text = `Base directory for this skill: ${parentDir(path)}\n\n${withArgs(body, e.args)}`
    return { result: { success: true, commandName: e.skill }, context: [text] }
  })
}
