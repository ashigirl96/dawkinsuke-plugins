# スキルが呼ぶスキル

スキルは本文で、ファイルの link ではなく名前で別のスキルを呼ぶ（`/grill-me`、`the **grill-me** skill`、`the **prove-it-works** principle`、`` `ask-matt` first ``）。呼ばれたスキルが除外されていると、エージェントは存在しないスキルを探して止まるか、その手順を黙って飛ばす。名前で呼ばれた upstream のスキルが、すべて読み込まれていることを確かめる。

## Sub-features

- `skill-slash`: `/<name>` と `/dawkinsuke:<name>` の形で呼ぶスキルが読み込まれている。
- `skill-wrapped`: `` `<name>` ``、`**<name>**`、`` `<name>` skill``、`**<name>** skill` の形で呼ぶスキルが読み込まれている。
- `skill-principle`: `**<name>** principle` の形で、`principle-` を外した名前で呼ぶ `principle-<name>` のスキルが読み込まれている。スキル台帳が `principle-<name>` の行に短い名前も載せるので拾える。

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
  - 改名した `pull-request` を外すと、新しい名前で呼んだ行が出る。改名前の `pr` は出ない。
- **短い名前の検出を確かめる.** テストは短い名前を写しで試さないので、次を流す。`principle-prove-it-works` を外した写しで、本文に `**prove-it-works** principle` とだけ書く `pstack/skills/poteto-mode/playbooks/hillclimb.md` から `missing-skill ...: principle-prove-it-works` が出て、最後が `exit 1` になる。

```sh
tmp=$(mktemp -d); cp -R . "$tmp/r"
( cd "$tmp/r" && echo pstack-claude/principle-prove-it-works >> upstream/exclude.txt && sh scripts/sync-skills.sh > /dev/null && { sh scripts/check-refs.sh; echo "exit $?"; } ) > "$run/principle-alias.txt" 2>&1
rm -rf "$tmp"
```

- **抜けの中身を写す.** `missing-skill` が出たら、`rg -n -e '<name>' <file> >> "$run/evidence.txt"` で該当行を残す。`principle-<x>` は本文では `<x>` と書かれているので、`principle-` を外して探す。改名したスキルは、改名前の名前でも探す。

## Gotchas

- 調べるのは、スキル台帳に載る名前だけ。2 つの upstream のスキル名（取り込み元の外のものも含む）、自作のスキル名、改名したスキルの改名前の名前、`principle-` を外した名前がこれにあたる。Claude Code の組み込みや別のプラグインのスキル名は見ない。
- ハイフンの無い 1 語の太字（`**teach**`）は強調と区別できないので、後ろに ` skill` があるときだけ数える。そのため `(it runs **teach**)` は拾えない。バッククォートの `` `teach` `` は拾う。
- 「use grill-me」のように記号で囲まずに書いた名前と、`"domain-modeling"` のように二重引用符で囲んだ名前は拾えない。`matt/skills/grill-with-docs/SKILL.md` は `grilling` と `domain-modeling` をこの形で呼ぶので、この 2 つが抜けても `grill-with-docs` からは出ない。
- 依存の依存は、入れたスキルの本文を調べたときに初めて出る。`setup-matt-pocock-skills` が抜けているうちは、それが呼ぶ `implement` は出ない。
