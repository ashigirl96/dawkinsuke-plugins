# スキルを入れる前に依存を調べる

除外している upstream のスキル（例: `figure-it-out`）を使いたくなったとき、そのスキルだけを入れると、名前で呼んでいるほかのスキルが抜けたままになる。checkout を変えずに、入れたら何が足りなくなるかを調べ、入れる組を決める。

## Sub-features

- `try-one`: 1 つのスキルを入れたときの抜けを出す。
- `try-closure`: 出た抜けも一緒に入れて繰り返し、抜けが無くなる組を見つける。
- `try-no-side-effect`: checkout の `upstream/exclude.txt` と symlink が変わらない。

## How to get to it (user POV)

- 「`figure-it-out` を使いたい」と思ったときに、`upstream/exclude.txt` を書き換える前に調べる。

## Driving it with claude --plugin-dir

Preconditions:

- Doctor が通っている。
- 入れたいスキルが `upstream/exclude.txt` に `<submodule>/<name>` の形で載っている。

- **1 つ入れる.** `sh scripts/try-include.sh cursor-plugins/figure-it-out > "$run/try-1.txt" 2> "$run/try-1.sync.txt"; echo $? >> "$run/try-1.txt"` を流す。`try-1.sync.txt` に `added figure-it-out` があり、`try-1.txt` に `missing-skill pstack/skills/figure-it-out/SKILL.md: <name>` が並ぶ。
- **抜けも入れて繰り返す.** 出た名前ごとに `upstream/exclude.txt` で `<submodule>/<name>` を探し、引数に足して流し直す（`sh scripts/try-include.sh cursor-plugins/figure-it-out cursor-plugins/poteto-mode ...`）。除外リストに無い名前を渡すと `error <key> is not in upstream/exclude.txt` で exit 2 になる。最後の行の exit code が `0` になるか、入れたくないスキルが出たら止める。出た回ごとに `$run/try-<n>.txt` に残す。
- **checkout が変わっていない.** `git status --short upstream/exclude.txt skills matt/skills pstack/skills > "$run/try-status.txt"` を流す。ファイルが空。
- **決めたあと.** 入れる組が決まったら、ユーザーの了承を得てから checkout の `upstream/exclude.txt` からその行を消し、`sh scripts/sync-skills.sh` と `sh scripts/check-refs.sh` を流す。`check-refs.sh` が exit 0 で終わる。

## Gotchas

- 引数は `<submodule>/<name>` の形で渡す。`tdd` と `teach` は両方の upstream にあるので、名前だけでは決まらない。
- 抜けの中に、入れたくないスキル（例: `poteto-mode` は pstack のほぼ全部を呼ぶ）が出ることがある。その場合は、入れたいスキルを `/fork-upstream-skill` で fork して参照を消すか、入れるのをやめるかをユーザーが決める。
- 1 回の実行は repo 全体を写すので数秒かかる。
