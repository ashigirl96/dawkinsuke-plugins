---
upstream: harness/pstack/claude-code/skills/how
own: []
---

# how の fork

## adapter を読ませる行を消し、Claude Code の名前で書く

upstream は冒頭で adapter を session ごとに読ませ、Cursor の名前を実行中に読み替えさせる。adapter を読ませる行を消し、adapter の `Subagent fields` 節に従い、`readonly: true` の `generalPurpose` を `Explore` に、brief に「do not edit files」と `git status` の確認を付け、`Tools` 節に従い、`Task` を `Agent` に、`Models` 節に従い、役割の行を `~/.cursor/rules/pstack-models.mdc` ではなく context にあるモデル表から読み、Cursor の既定の slug を `opus @xhigh` と `gpt-6.1-sol` に、推論の強さをモデル表の `@<level>` と `default effort` から決める形にして、本文を最初から Claude Code の名前で書いた。adapter を毎回 context に載せず、読み替えの漏れも防ぐため（`docs/adr/0005-fork-adapter-readers.md`）。

## subagent の推論の強さは、poteto-mode を引かずにモデル表から決める

upstream は subagent の推論の強さと速さを poteto-mode の Subagents 節に従って選ばせる。その指示を消し、モデル表の値の `@<level>` と `default effort` だけで決める形にした。poteto-mode は除外していて読めず、推論の強さはモデル表が役割ごとに持つため。速さは adapter の `Models` 節が `-fast` を落とす（`docs/adr/0005-fork-adapter-readers.md`）。
