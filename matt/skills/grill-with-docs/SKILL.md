---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.
disable-model-invocation: true
---

Call the Skill tool twice, for "grilling" and "domain-modeling".

Once the user confirms the shared understanding and the outcome is something to build, judge whether the work fits in a single fresh context window. State the evidence first: the modules it touches and the tracer-bullet slices you expect. Then, without asking:

- **Fits**: fork this conversation into a Bench.
  1. Confirm the seams to test at with the user, unless the interview already settled them.
  2. Publish an issue with the `ready-for-agent` label. Its body holds only the agreed decisions in a few lines, the seams, and the ADRs and glossary terms this session added.
  3. Run `monica task run <issue URL> --fork "$CLAUDE_CODE_SESSION_ID" '/tackle Work from the decisions in this conversation instead of fetching the issue; it only records them. Paths earlier in this conversation point at <this checkout>. First move the ADR and glossary changes this session made there into the current directory and revert them in <this checkout>; after that, edit only under the current directory.'` and stop. The work continues in the new Tab.
- **Doesn't fit**: read `../to-spec/SKILL.md` and follow it, then read `../to-tickets/SKILL.md` and follow it.
