---
upstream: harness/pstack/claude-code/skills/interrogate
own: []
---

# interrogate の fork

## adapter を読ませる行を消し、Claude Code の名前で書く

upstream は冒頭で adapter を session ごとに読ませ、Cursor の名前を実行中に読み替えさせる。adapter を読ませる行を消し、adapter の `Tools` 節に従い、`in-your-own-words` と `arena` を Skill tool で呼ぶ形に、`Subagent fields` 節に従い、`generalPurpose` を `general-purpose` に、`Models` 節に従い、`gpt-*` の adversary をその model に振り分ける subagent にして、本文を最初から Claude Code の名前で書いた。adapter を毎回 context に載せず、読み替えの漏れも防ぐため（`docs/adr/0005-fork-adapter-readers.md`）。
