---
name: reflect
description: Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect.
disable-model-invocation: true
---

# Reflect

Mine the current conversation for durable learnings, then route them into skill edits.

Invoke when the user says "reflect" or "/reflect". Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## 1. Locate the active transcript

Before fanning out, find this conversation's transcript, `~/.claude/projects/<slug>/<session>.jsonl`. The slug is the workspace path with each `/` and `.` changed to `-`, so `/work/proj` is `-work-proj`. The newest `.jsonl` directly in that folder is the current session, and its `<session>/subagents/` folder holds subagent transcripts. Do not glob across `~/.claude/projects/*/`. That crosses workspace boundaries and reads private chats from unrelated projects. If you cannot find it, pass a tight digest of the session instead.

## 2. Spawn three reviewers in parallel

One message, three `Agent` calls, `subagent_type: "general-purpose"`, or the `gpt-*` subagent type the value names. Reviewers need MCP access to look up the tickets, chat threads, and observability traces the transcript references, and `general-purpose` keeps the session's MCP servers. A `gpt-*` reviewer has no MCP servers from this session, so it reviews from the transcript alone, and you say so in the summary.

Each reviewer and the synthesizer name a role line of the model table and a default. The model table is `<repo>-models.md`, which the repo-local `<repo>.md` imports, so its lines are already in context. When they are not, the repo has no table. Set each spawn from its role line, or from the default if the table or the line is missing. Pass the value's model as `model` and its `@<level>` suffix as `effort`. A value without a suffix takes the table's `default effort` line, and omits `effort` when that line is `session` or missing. Leave `model` unset when the value is `auto` or `inherit-parent`. For a `gpt-*` value, pass as `subagent_type` the `Agent` subagent type whose description says it delegates to that model, and leave `model` unset. If no subagent type names it, omit `model` and say so. If the `Agent` tool rejects a value, use the default and say so.

| Lens | Role line | Default | Prompt template |
|---|---|---|---|
| Judgment | `reflect judgment, divergent, synthesizer` | `opus @xhigh` | `references/judgment-reviewer.md` |
| Tooling | `reflect tooling` | `gpt-6.1-sol` | `references/tooling-reviewer.md` |
| Divergent | `reflect judgment, divergent, synthesizer` | `opus @xhigh` | `references/divergent-reviewer.md` |

Pass each template verbatim, substituting the transcript path or digest where marked. Reviewers return findings in the `Agent` result.

## 3. Synthesize

One `Agent` call, `subagent_type: "general-purpose"`, role line `reflect judgment, divergent, synthesizer` (default `opus @xhigh`). It spot-verifies citations through MCP, and `general-purpose` keeps the session's MCP servers. When the role line names a `gpt-*` model, run the synthesizer on `general-purpose` with `model` unset, and say so. Pass `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. It returns an Accepted / Rejected / Backlog list.

## 4. Structural enforcement check

Move any Accepted item that a lint rule, script, metadata flag, or runtime check would enforce more reliably to Backlog. Call the Skill tool with `principle-encode-lessons-in-structure`.

## 5. Apply

Present the synthesizer's full Accepted / Rejected / Backlog output and wait for explicit approval before applying any Accepted edit. The user picks the subset and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply.

File each Backlog item to your team's devex or backlog tracker without waiting. Only the Accepted list waits for approval.

Never edit a skill under `~/.claude/plugins/cache/`. Before approval, show its destination, `.claude/skills/<skill>/` or `~/.claude/skills/<skill>/`. After approval, copy the skill folder there and edit the copy. Never open a PR or push.

Follow each approved row's Routing exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): the parent does it directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): call the Skill tool with `writing-for-agents` and run a draft / test / iterate loop with it.
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): call the Skill tool with `writing-for-agents` and tune the description with it.
- `new skill via create-skill: <kebab-name>`: call the Skill tool with `writing-for-agents` to create it. Do not invent the shape ad hoc.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done.

## 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker: `<issue title>` (`<tags>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.
