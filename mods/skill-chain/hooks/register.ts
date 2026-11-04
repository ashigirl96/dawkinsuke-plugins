import type { ApiMessage, Register } from 'claude-code'

type Block = { type?: string; text?: unknown; id?: string; tool_use_id?: string; name?: string; input?: { skill?: unknown }; is_error?: boolean }
type Skill = { name: string; text: string }

const BASE_DIR = /^Base directory for this skill: (.+)$/m
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
    ? body.replaceAll('$ARGUMENTS', () => args ?? '')
    : args
      ? `${body}\n\nARGUMENTS: ${args}`
      : body

// The model otherwise reads a name absent from the skill listing as a guess and skips the call, so a chain never starts.
const NAMED_SKILLS_RULE = ' A skill named in loaded skill instructions is callable even if unlisted.'

export const register: Register = on => {
  on('tool.describe', { tool: 'Skill' }, async (_, e, next) => {
    const described = await next(e)
    return { ...described, description: described.description + NAMED_SKILLS_RULE }
  })

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    // An organization's managed plugin may hide skill bodies from skill.prompt and session.append hooks; the transcript still holds them.
    const messages = await $.session.messages({ as: 'api', agentId: e.agentId })
    if ('deny' in messages) return next(e)

    const readSkill = async (path: string) => {
      const file = await $.fs.read(path)
      const frontmatter = file.match(FRONTMATTER)
      return { body: frontmatter ? file.slice(frontmatter[0].length) : file, isDisabled: !!frontmatter?.[1] && DISABLED.test(frontmatter[1]) }
    }

    // The engine writes this line first, so a later one (in arguments, say) is not the skill's own folder.
    const skillDirs = new Set(messages.flatMap(userTextsOf).flatMap(text => text.match(BASE_DIR)?.[1]?.trim() ?? []))
    // A plugin may declare several skills folders, so a caller's sibling folders are searched too, but only when the plugin declares the caller's own folder.
    const declaredSkillsDirs = async (skillsDir: string): Promise<string[]> => {
      for (let root = parentDir(skillsDir); root; root = parentDir(root)) {
        const manifest = `${root}/.claude-plugin/plugin.json`
        if (!(await $.fs.exists(manifest))) continue
        let declared: unknown
        try {
          declared = JSON.parse(await $.fs.read(manifest)).skills
        } catch {
          return [skillsDir]
        }
        const dirs = [`${root}/skills`, ...[declared ?? []].flat().filter((p): p is string => typeof p === 'string').map(p => `${root}/${p.replace(/^\.\//, '').replace(/\/+$/, '')}`)]
        return dirs.includes(skillsDir) ? dirs : [skillsDir]
      }
      return [skillsDir]
    }
    const skillsDirs = [...new Set((await Promise.all([...new Set([...skillDirs].map(parentDir))].map(declaredSkillsDirs))).flat())]

    const findSkill = async (name: string) => {
      for (const skillsDir of skillsDirs) {
        const path = `${skillsDir}/${name}/SKILL.md`
        if (await $.fs.exists(path)) return path
      }
    }

    // A body this hook answered with reaches the model as context, which the transcript does not hold: find its skill from the Skill call.
    const blocks = messages.flatMap((m: ApiMessage) => blocksOf(m.content))
    const succeeded = new Set(blocks.filter(b => b.type === 'tool_result' && !b.is_error).map(b => b.tool_use_id))
    const launched = blocks.flatMap(b =>
      b.type === 'tool_use' && b.name === 'Skill' && typeof b.input?.skill === 'string' && succeeded.has(b.id)
        ? [bareName(b.input.skill)]
        : [],
    )
    for (const name of new Set(launched.filter(isPlainName))) {
      const path = await findSkill(name)
      if (path) skillDirs.add(parentDir(path))
    }

    // Callers are judged by their SKILL.md, not the transcript, whose expanded text carries the call's arguments.
    const callers: Skill[] = []
    for (const dir of skillDirs) {
      const path = `${dir}/SKILL.md`
      if (await $.fs.exists(path)) callers.push({ name: baseName(dir), text: (await readSkill(path)).body })
    }

    // shortcut: a `plugin:` prefix is dropped, so the first skills folder holding the name wins; check the plugin if two plugins share a skill name.
    const name = bareName(e.skill)
    if (!isPlainName(name)) return next(e)
    const word = new RegExp(`(^|[^\\w-])${name}([^\\w-]|$)`)
    if (!callers.some(s => s.name !== name && word.test(s.text))) return next(e)

    const path = await findSkill(name)
    if (!path) return next(e)
    const { body, isDisabled } = await readSkill(path)
    if (!isDisabled) return next(e)

    const text = `Base directory for this skill: ${parentDir(path)}\n\n${withArgs(body, e.args)}`
    return { result: { success: true, commandName: e.skill }, context: [text] }
  })
}
