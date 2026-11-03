#!/bin/sh
# Claude Code が読み込んだスキルのうち、入っていないファイルやスキルを参照しているものを出す。
set -eu
cd "$(dirname "$0")/.."

loaded=$(claude --plugin-dir . plugin details dawkinsuke | sed -n 's/^ *Skills ([0-9]*) *//p' | tr -d ' ' | tr ',' '\n')
[ -n "$loaded" ] || { echo "error claude loaded no skills from this checkout" >&2; exit 2; }

upstream_names=$(for d in upstream/mattpocock-skills/skills/*/*/ upstream/cursor-plugins/harness/pstack/claude-code/skills/*/; do
	[ -d "$d" ] && basename "$d"
done | sort -u)
[ -n "$upstream_names" ] || { echo "error upstream submodules are not checked out" >&2; exit 2; }

# fence の中の path は使う側の repo の例なので見ない。
prose() {
	awk '/^[[:space:]]*(```|~~~)/ { fence = !fence; next } !fence' "$1"
}

file_refs() {
	prose "$1" | grep -oE '\]\([^)]+\)' | sed 's/^](//; s/)$//; s/ .*//; s/#.*//' | grep -vE '^$|^[a-z]+:|^/|^<' || true
	# `./` で始まる path は作業ディレクトリを指すので、隣のスキルへの `../` だけを見る。
	prose "$1" | grep -oE '`\.\./[^` ]+`' | tr -d '`' || true
}

skill_refs() {
	prose "$1" | grep -oE '(^|[^A-Za-z0-9_./-])/[a-z0-9][a-z0-9-]*' | sed 's|.*/||' || true
	# ハイフンの無い 1 語の太字は強調（**how**）と区別できないので、後ろに skill があるときだけ数える。
	prose "$1" | grep -oE '(`[a-z0-9-]+`|\*\*[a-z0-9-]+\*\*)( skill)?' | grep -vE '^\*\*[a-z0-9]+\*\*$' | sed 's/[`*]//g; s/ skill$//' || true
}

# principle のスキルは「the **prove-it-works** principle skill」のように principle- を外した名前で呼ばれる。
upstream_name() {
	if echo "$upstream_names" | grep -qx -e "$1"; then echo "$1"
	elif echo "$upstream_names" | grep -qx "principle-$1"; then echo "principle-$1"
	fi
}

# Claude は symlink 側の path を base directory として受け取るので、.. は cd で文字列として畳む。
resolves() {
	(cd "$(dirname "$1")" && cd "$(dirname "$2")" 2>/dev/null && [ -e "$(basename "$2")" ])
}

out=$(for name in $loaded; do
	dir=skills/$name
	[ -e "$dir" ] || dir=pstack/skills/$name
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
