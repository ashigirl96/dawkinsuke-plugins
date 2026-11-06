---
upstream: harness/pstack/claude-code/skills/show-me-your-work
own: []
---

# show-me-your-work の fork

## adapter を読ませる行を消し、Claude Code の名前で書く

upstream は冒頭で adapter を session ごとに読ませ、Cursor の名前を実行中に読み替えさせる。adapter を読ませる行を消し、adapter の `Tools` 節に従い、`unslop` と `principle-encode-lessons-in-structure` を Skill tool で呼ぶ形に、`Paths` 節に従い、transcript の場所を `~/.claude/projects/` に、`Models` 節に従い、別の model 系統の reviewer をその model に振り分ける subagent にして、本文を最初から Claude Code の名前で書いた。adapter を毎回 context に載せず、読み替えの漏れも防ぐため（`docs/adr/0005-fork-adapter-readers.md`）。

## reviewer の推論の強さは、poteto-mode を引かずに決める

upstream は reviewer の推論の強さと速さを poteto-mode の Subagents 節に従って選ばせる。その指示を消し、別の model 系統に振り分ける subagent を選ぶ指示だけを残した。poteto-mode は除外していて読めず、振り分け先の subagent は `model` を無視するため（`docs/adr/0005-fork-adapter-readers.md`）。
