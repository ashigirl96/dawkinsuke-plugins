#!/bin/sh
# Claude Code が読み込んだスキルのうち、入っていないファイルやスキルを参照しているものを出す。
set -eu
cd "$(dirname "$0")/.."

loaded=$(claude --plugin-dir . plugin details dawkinsuke | sed -n 's/^ *Skills ([0-9]*) *//p' | tr -d ' ' | tr ',' '\n')
[ -n "$loaded" ] || { echo "error claude loaded no skills from this checkout" >&2; exit 2; }

. scripts/layout.sh
. scripts/refs.sh

out=$(for name in $loaded; do
	for d in $link_dirs; do dir=$d/$name; [ -e "$dir" ] && break; done
	skill_docs "$dir" | while read -r f; do
		file_refs "$f" | sort -u | while read -r ref; do
			resolve_ref "$f" "$ref" > /dev/null || echo "missing-file $f: $ref"
		done
		skill_refs "$f" | while read -r ref; do upstream_name "$ref"; done | while read -r ref; do alias_of "$ref"; done | sort -u | while read -r ref; do
			echo "$loaded" | grep -qx -e "$ref" || echo "missing-skill $f: $ref"
		done
	done
done)
[ -z "$out" ] || { echo "$out"; exit 1; }
