#!/bin/sh
# Claude Code が読み込んだスキルのうち、入っていないファイルやスキルを参照しているものを出す。
set -eu
cd "$(dirname "$0")/.."

loaded=$(claude --plugin-dir . plugin details dawkinsuke | sed -n 's/^ *Skills ([0-9]*) *//p' | tr -d ' ' | tr ',' '\n')
[ -n "$loaded" ] || { echo "error claude loaded no skills from this checkout" >&2; exit 2; }

. scripts/refs.sh

# Claude は symlink 側の path を base directory として受け取るので、.. は cd で文字列として畳む。
resolves() {
	(cd "$(dirname "$1")" && cd "$(dirname "$2")" 2>/dev/null && [ -e "$(basename "$2")" ])
}

out=$(for name in $loaded; do
	for dir in skills/$name matt/skills/$name pstack/skills/$name; do [ -e "$dir" ] && break; done
	# ADR.md は fork の経緯の記録で、スキルの実行中には読まれない。
	find -L "$dir" -name '*.md' ! -name ADR.md | sort | while read -r f; do
		file_refs "$f" | sort -u | while read -r ref; do
			resolves "$f" "$ref" || echo "missing-file $f: $ref"
		done
		skill_refs "$f" | while read -r ref; do upstream_name "$ref"; done | sort -u | while read -r ref; do
			echo "$loaded" | grep -qx -e "$ref" || echo "missing-skill $f: $ref"
		done
	done
done)
[ -z "$out" ] || { echo "$out"; exit 1; }
