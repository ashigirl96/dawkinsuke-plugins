# pstack in Claude Code

pstack skills use Cursor names. The tables below map each Cursor name to Claude Code. A pstack fork is written with them in Claude Code names, and its `ADR.md` names each section it follows, such as the `Tools` section. `<pstack>` means the folder that holds `skills/` and `docs/`. If a Cursor field has no row, drop it and say so. Never pass a field or value the tool schema rejects.

## Tools

| Cursor | Claude Code |
| --- | --- |
| `Task` | `Agent` |
| `AskQuestion` | `AskUserQuestion`. In `-p` mode it is absent, so ask in plain text. |
| Open a todolist | Use `TodoWrite` if the session offers it. Otherwise keep the list in your reply and update it at each phase. |
| Run another pstack skill (`/name` or "the **name** skill") | Call the `Skill` tool with `dawkinsuke:<name>`. When you tell the user to type it, write `/dawkinsuke:<name>`. |
| `Grep`, `Glob` | `Bash` with `rg` when the session has no `Grep` or `Glob`. |
| `deslop` from `cursor-team-kit` | The `simplify` skill. |
| `control-ui` from `cursor-team-kit` | The `agent-browser` skill. |
| `control-cli` from `cursor-team-kit` | The `run` skill. |
| Cursor's built-in `create-skill` | The `writing-for-agents` skill. |
| Cursor's `/loop` | Claude Code's `/loop`. |

## Subagent fields

| Cursor | Claude Code |
| --- | --- |
| `subagent_type: generalPurpose` | `subagent_type: "general-purpose"` |
| `poteto-agent`, `comment-sicko` | `dawkinsuke:poteto-agent`, `dawkinsuke:comment-sicko` |
| `readonly: true` | `subagent_type: "Explore"`. It keeps `Bash`, so the brief also says "do not edit files", and you check `git status` afterward. |
| `readonly: false` | `general-purpose`. It keeps the session's MCP servers. |
| `environment: "cloud"` | `isolation: "worktree"`. Name the branch or commit the worker checks out. |
| `environment: "local"` | Omit. |
| `cloud_base_branch: <b>` | Tell the worker to check out `<b>` first. |
| `run_in_background: true` | Omit. Subagents run in the background by default and notify you when they finish. |
| `resume` | Spawn a new agent and paste the earlier result into its brief. |
| `file_attachments` | List the paths in the brief. |

## Models

| Cursor | Claude Code |
| --- | --- |
| `claude-<family>-<version>-<effort>[-fast]`, such as `claude-opus-5-5-xhigh` | `opus @xhigh`: pass `model: "opus"` and `effort: "xhigh"`. `model` takes only `opus`, `sonnet`, `haiku`, `fable`. Drop `-fast`. |
| A `grok-*`, `cursor-grok-*`, or `composer-*` slug | `gpt-6.1-sol`, then map it with the next row. Map it before any family check, so its family is `gpt-*`. |
| A `gpt-*` or other non-Claude model, such as `gpt-6.1-sol` | Pass as `subagent_type` the `Agent` subagent type whose description says it delegates to that model, in place of `general-purpose` or `Explore`. Omit `model`, which that subagent ignores. For `readonly: true`, the brief says "do not edit files". If no subagent type names the model, omit `model` so the agent runs on the session model, and say so. A model's family is its name prefix, so `gpt-*` is a family apart from `claude-*`. |
| `auto` or `inherit-parent` | Omit `model`. |
| The `pstack-models.mdc` rule, `~/.cursor/rules/pstack-models.mdc` | The model table, `~/.claude/repo-local/<host>/<owner>/<repo>-models.md`. The repo-local `<repo>.md` imports it, so its lines are in context. When they are not, the repo has no table, so use the skill's defaults. A missing role line also takes the default. |
| A role value, such as `opus` or `opus @high` | `model: "opus"`, and `effort: "high"` from the `@<level>` suffix. Levels are `low`, `medium`, `high`, `xhigh`, `max`. A value without the suffix takes the table's `default effort` line. When that line is `session` or missing, omit `effort`. In a panel list, each entry takes its own suffix, as in `opus @xhigh, sonnet`. |

The pstack forks read these role lines. A list value is a panel, and one subagent runs per entry.

| Role line | Fork | Default |
| --- | --- | --- |
| `arena runners` | `arena` | `opus @xhigh, gpt-6.1-sol` (list) |
| `arena cross-judge pool` | `arena` | `opus @xhigh, gpt-6.1-sol` (list) |
| `architect runners` | `architect` | `opus @xhigh, gpt-6.1-sol` (list) |
| `interrogate reviewers` | `interrogate` | the `arena runners` defaults (list) |
| `swarm workers` | `swarm` | `gpt-6.1-sol` |
| `how explorer` | `how` | `gpt-6.1-sol` |
| `how explainer` | `how` | `opus @xhigh` |
| `why investigators` | `why` | `gpt-6.1-sol` |
| `why synthesizer` | `why` | `opus @xhigh` |
| `reflect tooling` | `reflect` | `gpt-6.1-sol` |
| `reflect judgment, divergent, synthesizer` | `reflect` | `opus @xhigh` |

## Paths

| Cursor | Claude Code |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `.claude/skills/`, `~/.claude/skills/` |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | `~/.claude/plugins/`, `.claude-plugin/plugin.json` |
| `.cursor/rules/*.mdc`, always-applied rules | `CLAUDE.md`, or `AGENTS.md` when no `CLAUDE.md` exists. Claude Code never reads `.mdc` files. The model rule is the exception. See Models. |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | `<pstack>/<path>` when that file exists. The plugin ships the skills, `docs/guide/`, and `README.md`. Read the local copy and never fetch it. Give the user the URL when they need a link. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | `~/.claude/projects/<slug>/<session>.jsonl`. The slug is the workspace path with each `/` and `.` changed to `-`, so `/Users/you/proj` is `-Users-you-proj`. The newest `.jsonl` directly in that folder is the current session. Its `<session>/subagents/` folder holds subagent transcripts. Read only this workspace's folder. |

## Cursor-only features

Claude Code has no Cursor Automations, Bugbot, Cursor cloud agents, or built-in PR tool. When a step needs one, put one line in your reply, `Skipped in Claude Code: <step>. <reason>.`, then go on to the next step. Do not stop, ask, or retry. When a later step needs what the skipped step made, such as a URL or a key, leave a placeholder and name it in the line.

| Cursor | Claude Code |
| --- | --- |
| Cursor Automations: routines, `update_state` routine calls, `api2.cursor.sh/automations` webhooks, routine wakes, and `SendToUser` secret requests | Skip with the line. |
| Bugbot | Bugbot comments on a GitHub PR are ordinary review threads, so triage them with the forge command that the step gives. Skip a step that starts, waits for, or configures Bugbot when the PR has no Bugbot check or comment. |
| Cursor cloud agents | `environment: "cloud"` maps to a worktree, as in Subagent fields. Skip a step that needs the cloud agent itself, such as its dashboard status or its own machine. |
| A built-in PR tool | Use the forge command that the step gives, such as `gh pr create`. That is not a skip, so write no line. |
