# pstack の Claude Code 向けの読み替えは adapter 1 枚の fork に置く

0005 で置き換えた。実行中に adapter を読ませると、pstack のスキルを呼ぶ session ごとに adapter 全体が context に載るため。

pstack のスキルは、どれも最初に adapter（`docs/harness/claude-code.md`）を読んで Cursor の名前を Claude Code に読み替える。そこで、GPT への読み替え（Claude 以外の model 名は、Agent tool の一覧からその model に振り分ける subagent を選んで走らせる）、plugin 名の読み替え（`pstack:` を `dawkinsuke:` にする）、手動専用スキルの呼び方（Read から Skill tool へ）、Cursor にしかない道具の読み替え（`deslop` を `simplify` にする、など）の 4 つを、この 1 枚の fork にまとめて置く。fork の仕組みはスキルのディレクトリしか扱っていなかったので、この文書も fork できるように広げる。

## Considered Options

- 該当するスキル（`arena`・`architect`・`interrogate`・`swarm`・`how`・`why`・`reflect` など）を 1 つずつ fork する: upstream を上げるたびに何個も作り直すことになるので採らない。
- `~/.claude/rules/pstack-models.md` に書く: repo の外にあるうえ、`setup-pstack` がこの file を毎回まるごと書き直すので、足した行が消える。
