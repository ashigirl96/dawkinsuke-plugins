# スキルが読む文書

スキルは本文から、同じフォルダの文書（`[Agent brief](AGENT-BRIEF.md)`）、隣のスキル（`` `../implement/SKILL.md` ``）、pstack の共有文書（`../../docs/harness/claude-code.md`）を読む。スキルを使ったときに、そうした path の向き先がすべてあることを確かめる。

## Sub-features

- `file-same-skill`: 同じフォルダの文書へのリンクが解ける。
- `file-sibling`: `../<スキル>/...` の向き先のスキルが入っている。
- `file-pstack-docs`: pstack のスキルが読む `../../docs/` と `../../README.md` が `pstack/` にある。

## How to get to it (user POV)

- スキルを `/dawkinsuke:<name>` で呼ぶと、Claude は `Base directory for this skill: <checkout>/skills/<name>` を受け取り、そこから相対 path を読む。

## Driving it with claude --plugin-dir

Preconditions:

- Doctor が通っている。

- **全スキルを調べる.** `sh scripts/check-refs.sh > "$run/check-refs.txt"; echo $? > "$run/check-refs.exit"` を流す。`missing-file` の行が無い。
- **検出できることを確かめる.** `sh scripts/check-refs.test.sh > "$run/check-refs.test.txt"` を流す。最後の行が `ok`。このテストは写しで `mattpocock-skills/implement` を除外し、`missing-file matt/skills/setup-matt-pocock-skills/SKILL.md: ../implement/SKILL.md` が出ることと、`pstack/docs` を消して `../../docs/harness/claude-code.md` が出ることを見る。
- **抜けの中身を写す.** `missing-file` が出たら、`rg -n -F '<path>' <file> >> "$run/evidence.txt"` で該当行を残す。

## Gotchas

- base directory は symlink 側の path なので、`..` は upstream ではなく `matt/skills/` に出る。OS に `..` を解かせると upstream の並びで判定してしまう。`check-refs.sh` は `cd` で文字列として畳む。
- code fence の中の path（`./src/billing/GLOSSARY.md` など）と、バッククォートで囲んだ `./` の path（`teach` の `./lessons/` など）は使う側の repo を指すので見ない。
- `docs/agents/issue-tracker.md` のような `./` も `../` も付かない path は、使う側の repo のファイルなので見ない。
- `ADR.md` は fork の経緯の記録で実行中には読まれないので見ない。`FORK.diff` は `*.md` ではないので見ない。
