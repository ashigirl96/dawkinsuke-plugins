# スキルが呼ぶスキル

スキルは本文で、ファイルの link ではなく名前で別のスキルを呼ぶ（`/grill-me`、`the **grill-me** skill`、`` `ask-matt` first ``）。呼ばれたスキルが除外されていると、エージェントは存在しないスキルを探して止まるか、その手順を黙って飛ばす。名前で呼ばれた upstream のスキルが、すべて読み込まれていることを確かめる。

## Sub-features

- `skill-slash`: `/<name>` と `/dawkinsuke:<name>` の形で呼ぶスキルが読み込まれている。
- `skill-wrapped`: `` `<name>` ``、`**<name>**`、`` `<name>` skill``、`**<name>** skill` の形で呼ぶスキルが読み込まれている。

## How to get to it (user POV)

- スキルを `/dawkinsuke:<name>` で呼ぶと、エージェントは本文の指示に従い、別のスキルを Skill tool で呼ぶか、ユーザーに打つよう案内する。

## Driving it with claude --plugin-dir

Preconditions:

- Doctor が通っている。

- **全スキルを調べる.** `sh scripts/check-refs.sh > "$run/check-refs.txt"; echo $? > "$run/check-refs.exit"` を流す。`missing-skill` の行が無い。
- **検出できることを確かめる.** `sh scripts/check-refs.test.sh` が `ok` で終わる。このテストは写しで次を見る。
  - `implement` を除外すると `missing-skill matt/skills/setup-matt-pocock-skills/SKILL.md: implement` が出る。
  - `/dawkinsuke:grill-me` と書き足すと、除外中の `grill-me` が `missing-skill matt/skills/grilling/SKILL.md: grill-me` として出る。
  - `wait-what` の本文に太字の `grill-me` とバッククォートの `ask-matt` を書き足して入れると、その 2 つが出る。
- **抜けの中身を写す.** `missing-skill` が出たら、`rg -n -e '<name>' <file> >> "$run/evidence.txt"` で該当行を残す。

## Gotchas

- 調べるのは、upstream にある名前だけ。Claude Code の組み込みや別のプラグインのスキル名は見ない。
- ハイフンの無い 1 語の太字（`**teach**`）は強調と区別できないので、後ろに ` skill` があるときだけ数える。そのため `(it runs **teach**)` は拾えない。バッククォートの `` `teach` `` は拾う。
- 「use grill-me」のように記号で囲まずに書いた名前と、`"domain-modeling"` のように二重引用符で囲んだ名前は拾えない。`matt/skills/grill-with-docs/SKILL.md` は `grilling` と `domain-modeling` をこの形で呼ぶので、この 2 つが抜けても `grill-with-docs` からは出ない。
- 依存の依存は、入れたスキルの本文を調べたときに初めて出る。`setup-matt-pocock-skills` が抜けているうちは、それが呼ぶ `implement` は出ない。
