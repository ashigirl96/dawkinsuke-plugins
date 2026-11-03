# スキルが呼ぶスキル

スキルは本文で、ファイルの link ではなく名前で別のスキルを呼ぶ（`/grill-me`、`the **show-me-your-work** skill`、`the **prove-it-works** principle skill`、`` `architect` first ``）。呼ばれたスキルが除外されていると、エージェントは存在しないスキルを探して止まるか、その手順を黙って飛ばす。名前で呼ばれた upstream のスキルが、すべて読み込まれていることを確かめる。

## Sub-features

- `skill-slash`: `/<name>` の形で呼ぶスキルが読み込まれている。
- `skill-wrapped`: `` `<name>` ``、`**<name>**`、`` `<name>` skill``、`**<name>** skill` の形で呼ぶスキルが読み込まれている。
- `skill-principle`: `**<name>** principle skill` や `**<a>** and **<b>** principles` の形で呼ぶ `principle-<name>` のスキルが読み込まれている。

## How to get to it (user POV)

- スキルを `/dawkinsuke:<name>` で呼ぶと、エージェントは本文の指示に従い、別のスキルを Skill tool で呼ぶか、ユーザーに打つよう案内する。

## Driving it with claude --plugin-dir

Preconditions:

- Doctor が通っている。

- **全スキルを調べる.** `sh scripts/check-refs.sh > "$run/check-refs.txt"; echo $? > "$run/check-refs.exit"` を流す。`missing-skill` の行が無い。
- **検出できることを確かめる.** `sh scripts/check-refs.test.sh` が `ok` で終わる。このテストは写しで次を見る。
  - `implement` を除外すると `missing-skill matt/skills/setup-matt-pocock-skills/SKILL.md: implement` が出る。
  - `figure-it-out` を入れると `principle-encode-lessons-in-structure` と `show-me-your-work` が出る。
  - `blast-radius` を入れると、バッククォートだけで呼ばれた `arena` が出る。
- **抜けの中身を写す.** `missing-skill` が出たら、`rg -n -e '<name>' <file> >> "$run/evidence.txt"` で該当行を残す。`principle-<x>` は本文では `<x>` と書かれているので、`principle-` を外して探す。

## Gotchas

- 調べるのは、2 つの upstream のどちらかにある名前と、`principle-` を付けるとそうなる名前だけ。Claude Code の組み込みや別のプラグインのスキル名は見ない。
- ハイフンの無い 1 語の太字（`**how**`、`**why**`）は強調と区別できないので、後ろに ` skill` があるときだけ数える。そのため `(it runs **arena**)` は拾えない。バッククォートの `` `arena` `` は拾う。
- 「use grill-me」のように、記号で囲まずに書いた名前は拾えない。
- 依存の依存は、入れたスキルの本文を調べたときに初めて出る。`architect` が抜けているうちは、`architect` が呼ぶ `arena` は出ない。
