---
upstream: harness/pstack/claude-code/docs/harness
own: []
---

# harness（adapter）の fork

## Claude 以外の model を、その model に振り分ける subagent で走らせる

upstream は `grok-*` や `gpt-*` などの Claude 以外の model 名を省き、session の model で走らせる。手元では mod の codex subagent が Agent tool に GPT へ任せる subagent を足しているので、description にその model の名前がある subagent を `subagent_type` に選び、grok の既定は `gpt-6.1-sol` に読み替えるようにした。省くと、`arena` の judge などが Claude しか選べず、書いた者と別の model 系統に判定させる pstack の柱が崩れるため。

## plugin 名を dawkinsuke に読み替える

upstream は pstack が `pstack` という plugin で入る前提で、`/pstack:<name>` や `pstack:poteto-agent` と書く。手元では pstack のスキルと subagent を `dawkinsuke` の plugin に入れているので、`dawkinsuke:` に読み替えるようにした。

## 別の pstack のスキルを Skill tool で呼ぶ

upstream は Skill tool が手動専用のスキルを拒むので、SKILL.md を Read して従わせる。手元では mod の `skill-chain` が plugin の置き場所にある手動専用のスキルを Skill tool で通すので、Skill tool で呼ぶようにした。repo の fork の本文と同じ呼び方にそろえるため。

## Cursor にしかない道具を手元の道具に読み替える

upstream の adapter には、`cursor-team-kit` の `deslop`・`control-ui`・`control-cli`、Cursor 組み込みの `create-skill`、Cursor の `/loop` の行が無い。手元で役目がほぼ同じ `simplify`・`agent-browser`・`run`・`writing-for-agents`・Claude Code の `/loop` に読み替える行を足した。行が無いと、それに頼る playbook の手順が飛ばされるか、存在しない道具を探すため。

## 冒頭を、fork を書くときの翻訳の決まりとして説明する

upstream は冒頭で、この file を session ごとに読み、スキルの Cursor の名前を実行中に読み替えるよう書く。表は Cursor の名前を Claude Code の名前に移す決まりで、pstack の fork はこれに従って Claude Code の名前で書き、`ADR.md` に従った節を引く、と書き直した。adapter は実行中に読ませず、fork を書くときの決まりにしたため（`docs/adr/0005-fork-adapter-readers.md`）。

## モデル表を repo ごとのファイルから読み、推論の強さを `@<level>` と `default effort` で書く

upstream は役割の行を `~/.claude/rules/pstack-models.md` から読み、値を `<model> <effort>` と書く。手元ではモデル表を repo ごとの `~/.claude/repo-local/<host>/<owner>/<repo>-models.md` に置き、repo-local の `<repo>.md` が import するので、表が context に無ければその repo には表が無いとみなして既定を使うようにした。値は `<model>` か `<model> @<level>` と書き、suffix の無い値は `default effort` の行に従う。`setup-dawkinsuke` が pstack-claude の setup-pstack と同じ形で表を書くので、それに合わせるため。7 本の fork が読む役割の名前と既定を節に並べ、`setup-dawkinsuke` がこの名前で表を書けるようにした。

## setup-pstack の節を消す

upstream は `setup-pstack` を Claude Code で動かすための節を持つ。`setup-pstack` は除外し、モデル表は `setup-dawkinsuke` が書くので、節を消した（`docs/adr/0005-fork-adapter-readers.md`）。
