---
name: swarm
description: "Fan out N parallel workers, drain them, and return one report. Use for /swarm, 'swarm this', or parallel coverage, races, gauntlets, and exploration."
disable-model-invocation: true
---

# Swarm

## Start

Open a todo list with `TodoWrite`, or keep it in your reply when the session has no `TodoWrite`, with one entry per phase before launching anything.

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
3. Pick the worker model from the `swarm workers` line of the model table. If the table or that line is missing, use `gpt-6.1-sol`. The model table is `<repo>-models.md`, which the repo-local `<repo>.md` imports, so its lines are already in context. When they are not, the repo has no table. Pass the value's model as `model` and its `@<level>` suffix as `effort`. A value without a suffix takes the table's `default effort` line, and omits `effort` when that line is `session` or missing. Leave `model` unset when the value is `auto` or `inherit-parent`. For a `gpt-*` value, pass as `subagent_type` the `Agent` subagent type whose description says it delegates to that model, and leave `model` unset. If no subagent type names it, omit `model` and say so. If the `Agent` tool rejects a value, use the default and say so. For a model race, name each arm's model up front.
4. Give each worker its own writable output when it writes. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method (sample count, what one sample is, order). The worker records both in its result.

## Phase B: Fan out

Spawn all N workers in one message with `subagent_type: "general-purpose"`, or the step 3 `gpt-*` subagent type, `isolation: "worktree"`, and the step 3 model and effort. Each brief names the branch or commit the worker checks out. Omit `isolation` only when the worker needs this checkout itself, such as its uncommitted files or a process it runs.

When a worker must start from a non-default pushed branch, tell it to check out that branch first.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence. A worker that can prove a defect reports `ISSUES` and lists every issue it can prove, not only the first.

If a worker drops out, proceed with N-1 and note it.

## Phase C: Aggregate

Read the terminal results. Drop a result that does not record the SHAs and method its brief names, and respawn that worker once. After a second miss, record a gap. A gap does not count as a pass. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

## Phase D: Report

Return one consolidated in-chat report with a result table, issue one-liners, gaps or dropouts, and the race rule when used.
