#!/bin/sh
# Claude Code が読み込んだスキルのうち、入っていないファイルやスキルを参照しているものを出す。
set -eu
cd "$(dirname "$0")/.."

loaded=$(claude --plugin-dir . plugin details dawkinsuke | sed -n 's/^ *Skills ([0-9]*) *//p' | tr -d ' ' | tr ',' '\n')
[ -n "$loaded" ] || { echo "error claude loaded no skills from this checkout" >&2; exit 2; }

ledger=$(sh scripts/ledger.sh)
. scripts/refs.sh

out=$(for name in $loaded; do
	dir=$(echo "$ledger" | awk -F'\t' -v n="$name" '$1 == n && $3 != "-" && $6 != "excluded" && $6 != "conflict" { print $3 "/" $1; exit }')
	skill_docs "$dir" | while read -r f; do
		file_refs "$f" | sort -u | while read -r ref; do
			resolve_ref "$f" "$ref" > /dev/null || echo "missing-file $f: $ref"
		done
		refs=$(skill_refs "$f" | sort -u)
		[ -n "$refs" ] || continue
		echo "$ledger" | sh scripts/ledger.sh - $refs | cut -f1 | sort -u | while read -r ref; do
			echo "$loaded" | grep -qx -e "$ref" || echo "missing-skill $f: $ref"
		done
	done
done)
[ -z "$out" ] || { echo "$out"; exit 1; }
