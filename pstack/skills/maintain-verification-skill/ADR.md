---
upstream: harness/pstack/claude-code/skills/maintain-verification-skill
own: []
---

# maintain-verification-skill の fork

## adapter を読ませる行を消し、Claude Code の名前で書く

upstream は冒頭で adapter を session ごとに読ませ、Cursor の名前を実行中に読み替えさせる。adapter を読ませる行を消し、adapter の `Tools` 節に従い、`/create-verification-skill` を `/dawkinsuke:` 付きに、`Paths` 節に従い、`.cursor/skills/` を `.claude/skills/` に、`Subagent fields` 節の `readonly: true` の行に従い、読むだけの subagent を `Explore` にして「do not edit files」と `git status` の確認を足し、本文を最初から Claude Code の名前で書いた。adapter を毎回 context に載せず、読み替えの漏れも防ぐため（`docs/adr/0005-fork-adapter-readers.md`）。
