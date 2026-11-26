# スキルが読む文書

スキルは `SKILL.md` やその下の文書から、同じフォルダの文書（`[Agent brief](AGENT-BRIEF.md)`）、隣のスキル（`` `../implement/SKILL.md` ``）、隣のスキルの下の文書（`../poteto-mode/references/codex-tools.md`、`references/` からの `../../setup-pstack/references/runtimes.md`）を読む。スキルを使ったときに、そうした path の向き先がすべてあることを確かめる。

## Sub-features

- `file-same-skill`: 同じフォルダの文書へのリンクが解ける。
- `file-sibling`: `../<スキル>/...` や、1 段深い文書からの `../../<スキル>/...` の向き先のスキルとファイルが入っている。

## How to get to it (user POV)

- スキルを `/dawkinsuke:<name>` で呼ぶと、Claude は `Base directory for this skill: <checkout>/<置き場>/<name>`（置き場は `skills`・`matt/skills`・`pstack/skills`）を受け取り、そこから相対 path を読む。

## Driving it with claude --plugin-dir

Preconditions:

- Doctor が通っている。

- **全スキルを調べる.** `sh scripts/check-refs.sh > "$run/check-refs.txt"; echo $? > "$run/check-refs.exit"` を流す。`missing-file` の行が無い。
- **検出できることを確かめる.** `sh scripts/check-refs.test.sh > "$run/check-refs.test.txt"` を流す。最後の行が `ok`。このテストは写しで `mattpocock-skills/implement` を除外し、`missing-file matt/skills/setup-matt-pocock-skills/SKILL.md: ../implement/SKILL.md` が出ることと、下の Gotchas の見ない path が出ないことを見る。
- **抜けの中身を写す.** `missing-file` が出たら、`rg -n -F '<path>' <file> >> "$run/evidence.txt"` で該当行を残す。

## Gotchas

- base directory は symlink 側の path なので、`..` は upstream ではなく `matt/skills/` や `pstack/skills/` に出る。OS に `..` を解かせると upstream の並びで判定してしまう。`check-refs.sh` は `cd` で文字列として畳む。
- code fence の中の path（`./src/billing/GLOSSARY.md` など）と、バッククォートで囲んだ `./` の path（`teach` の `./lessons/` など）は使う側の repo を指すので見ない。
- `docs/agents/issue-tracker.md` のような `./` も `../` も付かないバッククォートの path は、使う側の repo のファイルなので見ない。markdown のリンク先（`(./LEARNING-RECORD-FORMAT.md)`、`(AGENT-BRIEF.md)`）は、前置きによらず見る。
- `<name>` を含む path、リンク先が `url` だけのもの、`../.claude/skills` のように `../` の直後が `.` で始まる path は、書式の見本か別の道具の設定の例なので見ない（`pstack/skills/poteto-mode/references/pi-tools.md` に後者がある）。
- `ADR.md` は fork の経緯の記録で実行中には読まれないので見ない。`FORK.diff` は `*.md` ではないので見ない。
