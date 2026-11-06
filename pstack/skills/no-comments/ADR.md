---
upstream: harness/pstack/claude-code/skills/no-comments
own: []
---

# no-comments の fork

## adapter を読ませる行を消し、Claude Code の名前で書く

upstream は冒頭で adapter を session ごとに読ませ、Cursor の名前を実行中に読み替えさせる。adapter を読ませる行を消し、adapter の `Tools` 節に従い、`Task` を `Agent` に、`/how`・`/why`・`/architect` と principle のスキルを Skill tool で呼ぶ形にし、`Subagent fields` 節に従い、`comment-sicko` を `dawkinsuke:comment-sicko` にして、本文を最初から Claude Code の名前で書いた。adapter を毎回 context に載せず、読み替えの漏れも防ぐため（`docs/adr/0005-fork-adapter-readers.md`）。

## subagent の推論の強さは、poteto-mode を引かずにその場で決める

upstream は comment-sicko の推論の強さと速さを poteto-mode の Subagents 節に従って選ばせる。`effort` を仕事に合わせて選ぶ指示だけにし、速さは adapter の `Models` 節が `-fast` を落とすので消した。poteto-mode は除外していて読めないため（`docs/adr/0005-fork-adapter-readers.md`）。
