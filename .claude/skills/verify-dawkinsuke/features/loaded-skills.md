# 読み込まれるスキル

ユーザーが dawkinsuke を使うと、Claude Code は checkout の `skills/` と、`plugin.json` の `skills` が指す `matt/skills/`・`pstack/skills/` からスキルを読み込む。置いたスキルがすべて読み込まれ、置いていないスキルが読み込まれないことを確かめる。

## Sub-features

- `loaded-match`: 読み込まれたスキル名の一覧が、`skills/`・`matt/skills/`・`pstack/skills/` の並びと一致する。
- `loaded-no-broken`: 向き先の無い symlink が無い。

## How to get to it (user POV)

- `claude --plugin-dir .` で checkout を読ませて session を始める。
- marketplace から入れた `dawkinsuke@plugins` を有効にして session を始める（Read from が checkout を指す）。

## Driving it with claude --plugin-dir

Preconditions:

- Doctor が通っている。

- **一覧を取る.** `claude --plugin-dir . plugin details dawkinsuke > "$run/details.txt"` を流す。`Skills (N)` の行にスキル名が並ぶ。
- **並びと比べる.** `sed -n 's/^ *Skills ([0-9]*) *//p' "$run/details.txt" | tr -d ' ' | tr ',' '\n' | sort > "$run/loaded.txt"` と `ls skills matt/skills pstack/skills 2>/dev/null | grep -v ':$' | grep -v '^$' | sort > "$run/on-disk.txt"` を流し、`diff "$run/loaded.txt" "$run/on-disk.txt" > "$run/loaded.diff"` が exit 0 になる。
- **壊れた symlink.** `find -L skills matt pstack -type l 2>/dev/null > "$run/broken-links.txt"` を流す。ファイルが空。

## Gotchas

- `plugin details .` や `plugin details --plugin-dir .` は通らない。`--plugin-dir` は `claude` の直後に置く。
- `Source:` が `dawkinsuke@inline` 以外なら、入れてある版を見ている。
- `plugin.json` の `skills` を書き換えた直後は、ここが最初に崩れる。
