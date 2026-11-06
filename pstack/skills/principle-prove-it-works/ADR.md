---
upstream: harness/pstack/claude-code/skills/principle-prove-it-works
own: []
---

# principle-prove-it-works の fork

## adapter を読ませる行を消し、Claude Code の名前で書く

upstream は冒頭で adapter を session ごとに読ませ、Cursor の名前を実行中に読み替えさせる。adapter を読ませる行を消し、adapter の `Tools` 節に従い、`show-me-your-work` を Skill tool で呼ぶ形にして、本文を最初から Claude Code の名前で書いた。adapter を毎回 context に載せず、読み替えの漏れも防ぐため（`docs/adr/0005-fork-adapter-readers.md`）。
