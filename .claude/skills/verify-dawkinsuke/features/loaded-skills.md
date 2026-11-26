# 読み込まれるスキルと agent

ユーザーが dawkinsuke を使うと、Claude Code は checkout の `skills/` と、`plugin.json` の `skills` が指す `matt/skills/`・`pstack/skills/` からスキルを、ルートの `agents`（pstack の agent のディレクトリへの symlink）から agent を読み込む。置いたものがすべて読み込まれ、置いていないものが読み込まれないことと、pstack の fork が呼ぶ `dawkinsuke:<agent>` の名前で agent が登録されることを確かめる。

## Sub-features

- `loaded-match`: 読み込まれたスキル名の一覧が、`skills/`・`matt/skills/`・`pstack/skills/` の並びと一致する。
- `loaded-no-broken`: 向き先の無い symlink が無い。
- `loaded-agents`: 読み込まれた agent 名の一覧が、`agents/*.md` の並びと一致する。
- `agent-namespace`: agent が `dawkinsuke:<agent>` の名前で登録される。`poteto-mode`・`thermos`・`no-comments` の fork はこの名前で subagent を呼ぶ。

## How to get to it (user POV)

- `claude --plugin-dir .` で checkout を読ませて session を始める。
- marketplace から入れた `dawkinsuke@dawkinsuke` を有効にして session を始める（Read from が checkout を指す）。

## Driving it with claude --plugin-dir

Preconditions:

- Doctor が通っている。

- **一覧を取る.** `claude --plugin-dir . plugin details dawkinsuke > "$run/details.txt"` を流す。`Skills (N)` の行にスキル名が並ぶ。
- **並びと比べる.** `sed -n 's/^ *Skills ([0-9]*) *//p' "$run/details.txt" | tr -d ' ' | tr ',' '\n' | sort > "$run/loaded.txt"` と `ls skills matt/skills pstack/skills 2>/dev/null | grep -v ':$' | grep -v '^$' | sort > "$run/on-disk.txt"` を流し、`diff "$run/loaded.txt" "$run/on-disk.txt" > "$run/loaded.diff"` が exit 0 になる。
- **壊れた symlink.** `find -L skills matt pstack agents -type l 2>/dev/null > "$run/broken-links.txt"` を流す。ファイルが空。
- **agent の並びと比べる.** `sed -n 's/^ *Agents ([0-9]*) *//p' "$run/details.txt" | tr -d ' ' | tr ',' '\n' | sort > "$run/agents-loaded.txt"` と `ls agents/ | sed 's/\.md$//' | sort > "$run/agents-on-disk.txt"` を流し、`diff "$run/agents-loaded.txt" "$run/agents-on-disk.txt"` が exit 0 になる。`Hooks (0)` の行もあり、pstack の hook は取り込んでいない。
- **agent の登録名.** `claude -p --setting-sources project --plugin-dir . --model haiku "Without calling any tool, list every subagent_type value your Agent tool accepts whose name contains 'poteto-agent', 'comment-sicko' or 'thermo-nuclear'. Print each exactly as written in the tool description, one per line, nothing else." > "$run/agent-names.txt"` を流す。4 行がすべて `dawkinsuke:` で始まる。

## Gotchas

- `plugin details .` や `plugin details --plugin-dir .` は通らない。`--plugin-dir` は `claude` の直後に置く。
- `Source:` が `dawkinsuke@inline` 以外なら、入れてある版を見ている。
- `plugin.json` の `skills` を書き換えた直後は、ここが最初に崩れる。
- `agents` の symlink は `sync-skills.sh` の管理外。upstream で agent の場所が変わると `agents` 自体が向き先の無い symlink になり、`Agents` の行が消える。
- agent の登録名は `plugin details` に前置きなしで出るので、名前空間は `-p` の session に聞くしかない。`--setting-sources project` で、入れてある dawkinsuke を外して checkout だけを見る。
