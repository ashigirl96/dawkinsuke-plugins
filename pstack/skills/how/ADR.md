---
upstream: harness/pstack/claude-code/skills/how
own: []
---

# how の fork

## adapter を読ませる行を消し、Claude Code の名前で書く

upstream は冒頭で adapter を session ごとに読ませ、Cursor の名前を実行中に読み替えさせる。adapter を読ませる行を消し、adapter の `Subagent fields` 節に従い、`readonly: true` の `generalPurpose` を `Explore` に、brief に「do not edit files」と `git status` の確認を付け、`Tools` 節に従い、`Task` を `Agent` にして、本文を最初から Claude Code の名前で書いた。adapter を毎回 context に載せず、読み替えの漏れも防ぐため（`docs/adr/0005-fork-adapter-readers.md`）。
