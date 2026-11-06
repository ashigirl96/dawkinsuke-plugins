---
upstream: harness/pstack/claude-code/skills/architect
own: []
---

# architect の fork

## adapter を読ませる行を消し、Claude Code の名前で書く

upstream は冒頭で adapter を session ごとに読ませ、Cursor の名前を実行中に読み替えさせる。adapter を読ませる行を消し、adapter の `Tools` 節に従い、todo の開き方を `TodoWrite` に、`how`・`why`・`arena`・`interrogate` と principle のスキルを Skill tool で呼ぶ形にし、`Models` 節に従い、役割の行を `~/.cursor/rules/pstack-models.mdc` ではなく context にあるモデル表から読み、Cursor の既定の slug を `opus @xhigh` と `gpt-6.1-sol` に、推論の強さをモデル表の `@<level>` と `default effort` から決める形にして、本文を最初から Claude Code の名前で書いた。adapter を毎回 context に載せず、読み替えの漏れも防ぐため（`docs/adr/0005-fork-adapter-readers.md`）。
