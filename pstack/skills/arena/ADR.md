---
upstream: harness/pstack/claude-code/skills/arena
own: []
---

# arena の fork

## adapter を読ませる行を消し、Claude Code の名前で書く

upstream は冒頭で adapter を session ごとに読ませ、Cursor の名前を実行中に読み替えさせる。adapter を読ませる行を消し、adapter の `Tools` 節に従い、todo の開き方を `TodoWrite` に、principle のスキルを Skill tool で呼ぶ形にし、`Models` 節に従い、役割の行を `~/.cursor/rules/pstack-models.mdc` ではなく context にあるモデル表から読み、Cursor の既定の slug を `opus @xhigh` と `gpt-6.1-sol` に、推論の強さをモデル表の `@<level>` と `default effort` から決める形にし、`Subagent fields` 節に従い、`run_in_background` を消し、readonly の judge には「do not edit files」と `git status` の確認を付けて、本文を最初から Claude Code の名前で書いた。adapter を毎回 context に載せず、読み替えの漏れも防ぐため（`docs/adr/0005-fork-adapter-readers.md`）。

## subagent の推論の強さは、poteto-mode を引かずにモデル表から決める

upstream は subagent の推論の強さと速さを poteto-mode の Subagents 節に従って選ばせる。その指示を消し、モデル表の値の `@<level>` と `default effort` だけで決める形にした。poteto-mode は除外していて読めず、推論の強さはモデル表が役割ごとに持つため。速さは adapter の `Models` 節が `-fast` を落とす（`docs/adr/0005-fork-adapter-readers.md`）。

## model 系統を Claude と gpt の 2 つにし、judge は gpt から選ぶ

upstream は `claude-*`・`grok-*`・`composer-*` の系統と、slug を誤ったときに error から近い slug を選ぶ手順を持つ。手元の `model` は `opus`・`sonnet`・`haiku`・`fable` しか受けず、Claude 以外は `gpt-*` だけなので、系統を Claude と `gpt-*` の 2 つにし、近い slug を探す手順を、系統の既定に戻す手順にした。Claude Code の親は Claude で動くので、cross-judge は pool の `gpt-*` からだけ選ぶ。
