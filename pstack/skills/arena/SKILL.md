---
name: arena
description: "Spawn N parallel candidates at the same task, pick a base, graft the strongest parts of the losers into it. Use for /arena, 'arena this', 'throw it in the arena', or when one attempt at a non-trivial artifact would lock in the wrong shape."
disable-model-invocation: true
---

# Arena

Open a todo list with `TodoWrite`, or keep it in your reply when the session has no `TodoWrite`, with one entry per phase (Frame, Fan out, Cross-judge, Pick, Graft, Verify) before launching anything.

## Phase A: Frame

Every candidate gets the same prompt, so the prompt is the contract.

1. State the artifact each candidate is producing.
2. Derive the rubric, 3-6 concrete gradeable criteria for what success looks like on *this* task. It is the picker's tool in Phase D. Candidates only see the task.
3. Pick the runners from the `arena runners` line of the model table, by default `fable @high`, `opus @high`, and `gpt-6.1-sol`. The model table is `<repo>-models.md`, which the repo-local `<repo>.md` imports, so its lines are already in context. When they are not, the repo has no table. Each entry is one seat. Pass the entry's model as `model` and its `@<level>` suffix as `effort`. An entry without a suffix takes the table's `default effort` line, and omits `effort` when that line is `session` or missing. An `auto` or `inherit-parent` entry is the parent model, so omit `model` and spawn `general-purpose`. For a `gpt-*` entry, pass as `subagent_type` the `Agent` subagent type whose description says it delegates to that model, and omit `model`. Families: `fable` is one, `opus`, `sonnet`, and `haiku` are another, and `gpt-*` is a third. If the `Agent` tool rejects an entry, or no subagent type names its `gpt-*` model, run that seat on its family's default, `fable @high`, `opus @high`, or `gpt-6.1-sol`, or drop the seat, keep at least two runners, and say so. Spawn more for multiple design directions, and repeat one model when the work is generation-bound, not judgment-sensitive.
4. Give each candidate its own output location (a git worktree where possible, otherwise `/tmp/arena-<slug>/candidate-<n>/`), per `principle-separate-before-serializing-shared-state` (call the Skill tool with `principle-separate-before-serializing-shared-state`).

## Phase B: Fan out

Spawn all N subagents in one message, each with the task, the path to the shared grounding, its own output path, and instructions to produce the artifact and a short rationale naming the alternatives it considered and what it rejected.

If a candidate produces no output, proceed with N-1 and note the dropout.

## Phase C: Cross-judge

After all Phase B candidates complete, spawn one read-only judge from the `arena cross-judge pool` line of the model table, by default `opus @high`, `gpt-6.1-sol`. Set it up as in Phase A step 3. Its brief says "do not edit files", and you check `git status` after it returns. The judge is never from the parent's vendor, and Fable counts as Claude for that check. Claude Code runs the parent on a Claude model, so use the first `gpt-*` entry in pool order. An `auto` or `inherit-parent` entry is the parent model. If no subagent type names an entry's model, move to the next `gpt-*` entry, then `gpt-6.1-sol`, or skip the judge, and say so. While you read in Phase D, the judge scores each candidate, by path label, on each rubric criterion and recommends a base.

## Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion, not on holistic feel, and compare with the cross-judge when Phase C ran one. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API, per `principle-laziness-protocol` (call the Skill tool with `principle-laziness-protocol`).

## Phase E: Graft

Walk each losing candidate once more for what is worth porting into the base, usually one or two things per candidate, not most of it. Fold each graft in by hand, per `principle-redesign-from-first-principles` (call the Skill tool with `principle-redesign-from-first-principles`), so the result stays coherent under one mental model. Don't paste mechanically.

If the candidates converge on one shape, that is strong agreement. Note it and ship the consensus shape. No graft is needed. If they wildly diverge, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

## Phase F: Verify

Verify the synthesized artifact like any other output, per `principle-prove-it-works` (call the Skill tool with `principle-prove-it-works`). If verification finds a problem the arena missed, either Phase A was wrong (re-frame and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.

## Outputs

One synthesized artifact, with a short synthesis note alongside naming the base and why, the cross-judge's verdict or that Phase C skipped the judge, each graft with its source candidate, what was rejected and why, any convergence or dropouts, and the verification result.
