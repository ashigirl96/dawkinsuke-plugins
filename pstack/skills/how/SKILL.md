---
name: how
description: "Use for \"how does X work\", code walkthroughs before changing something, and placement / ownership / layering questions (\"where should this live\", \"which package owns this\", \"is this the right layer\"). Explains subsystem architecture, runtime flow, onboarding mental models. Use why for motivation."
disable-model-invocation: true
---

# How

Explore the codebase to answer "how does X work?" questions. Produce architectural explanations at the level of a senior engineer onboarding onto a subsystem, enough to build a working mental model, not so much that it reads like annotated source code.

Every spawn is a read-only `Agent` subagent with `subagent_type: "Explore"`. Its brief says "do not edit files", and you check `git status` after it returns. Explorers use the `how explorer` line of the model table (default `gpt-6.1-sol`), and every explainer uses the `how explainer` line (default `opus @xhigh`). The model table is `<repo>-models.md`, which the repo-local `<repo>.md` imports, so its lines are already in context. When they are not, the repo has no table. Set each spawn from its role line, or from the default if the table or the line is missing. Pass the value's model as `model` and its `@<level>` suffix as `effort`. A value without a suffix takes the table's `default effort` line, and omits `effort` when that line is `session` or missing. Leave `model` unset when the value is `auto` or `inherit-parent`. For a `gpt-*` value, pass as `subagent_type` the `Agent` subagent type whose description says it delegates to that model, and leave `model` unset. If no subagent type names it, omit `model` and say so. If the `Agent` tool rejects a value, use the default and say so.

## 1. Assess complexity

If the scope is ambiguous, state your interpretation and explore. The user can redirect.

- **Simple** (a single module, a small utility, a narrow question such as "how does function X work"): no explorers. Spawn one explainer that explores and explains in one pass, built from `references/explainer-prompt.md` without the explorer-findings section. Go to step 4.
- **Complex** (a subsystem spanning multiple files or services, a cross-cutting feature, a full architectural overview): go to step 2.

When in doubt, take the simple path.

## 2. Explore (complex only)

Decompose the question into 2 to 4 angles, each a distinct slice of the subsystem. Spawn all explorers in a single message, each with `references/explorer-prompt.md` and its angle filled in.

## 3. Synthesize (complex only)

Once all explorers have returned, spawn one explainer with `references/explainer-prompt.md` and every explorer's findings filled in.

## 4. Present

Present the explainer's output. Light edits for clarity or context from the conversation are fine. Do not substantially rewrite it.

## Output format

The explanation uses the sections defined in `references/explainer-prompt.md`, dropping any that do not apply: Overview, Key Concepts, How It Works, Where Things Live, Gotchas.
