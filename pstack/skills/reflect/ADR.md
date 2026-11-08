---
upstream: harness/pstack/claude-code/skills/reflect
own: []
---

# reflect の fork

## adapter を読ませる行を消し、Claude Code の名前で書く

upstream は冒頭で adapter を session ごとに読ませ、Cursor の名前を実行中に読み替えさせる。adapter を読ませる行を消し、adapter の `Paths` 節に従い、transcript の場所を `~/.claude/projects/` に、`plugins/cache/` と `.cursor/skills/` を Claude Code の場所にし、`Tools` 節に従い、`Task` を `Agent` に、`create-skill` を `writing-for-agents` に、principle のスキルを Skill tool で呼ぶ形にし、`Subagent fields` 節に従い、`readonly: false` を `general-purpose` に、`Models` 節に従い、役割の行を `~/.cursor/rules/pstack-models.mdc` ではなく context にあるモデル表から読み、Cursor の既定の slug を `opus @xhigh` と `gpt-6.1-sol` に、推論の強さをモデル表の `@<level>` と `default effort` から決める形にして、本文を最初から Claude Code の名前で書いた。adapter を毎回 context に載せず、読み替えの漏れも防ぐため（`docs/adr/0005-fork-adapter-readers.md`）。

## subagent の推論の強さは、poteto-mode を引かずにモデル表から決める

upstream は subagent の推論の強さと速さを poteto-mode の Subagents 節に従って選ばせる。その指示を消し、モデル表の値の `@<level>` と `default effort` だけで決める形にした。poteto-mode は除外していて読めず、推論の強さはモデル表が役割ごとに持つため。速さは adapter の `Models` 節が `-fast` を落とす（`docs/adr/0005-fork-adapter-readers.md`）。

## reviewer が「使ったスキル」と数える証拠に、Skill tool の呼び出しを足す

upstream の reviewer の手引き（`references/` の 3 本）は、`SKILL.md` の `Read` と `Task` の prompt を、スキルを使った証拠に数える。Claude Code の transcript ではスキルは Skill tool の呼び出しとして残るので、それを足し、場所を `.claude/` と `Agent` に読み替えた（adapter の `Paths` 節と `Tools` 節）。足さないと、使ったスキルへの指摘が「使っていない」として捨てられるため。

## gpt の reviewer は transcript だけで見させ、synthesizer は gpt に任せない

upstream の reviewer と synthesizer は、どの model でも同じ MCP を使える。手元の `gpt-*` の subagent は、この session の MCP server を持たない。reviewer は transcript だけでも指摘を出せるので、gpt のまま走らせてそう言わせる。synthesizer は MCP で引用を確かめるのが役目なので、役割の行が `gpt-*` なら `general-purpose` で走らせるようにした。

## transcript の slug の例を、home の外の path にする

adapter の `Paths` 節は slug の例に macOS の home の下の path を使う。手元の commit の hook は home の形の path を手元の値として止めるので、例を `/work/proj` にした。
