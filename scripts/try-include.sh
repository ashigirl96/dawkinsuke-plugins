#!/bin/sh
# 引数のスキルを除外から外した写しで check-refs.sh を流す。checkout は変えない。
set -eu
[ $# -gt 0 ] || { echo "usage: sh scripts/try-include.sh <submodule>/<name>..." >&2; exit 2; }
repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -R "$repo" "$tmp/r"
cd "$tmp/r"
ledger=$(sh scripts/ledger.sh)
for key in "$@"; do
	echo "$ledger" | awk -F'\t' -v k="$key" '$4 == k && $6 == "excluded" { found = 1 } END { exit !found }' ||
		{ echo "error $key is not in upstream/exclude.txt" >&2; exit 2; }
	awk -v k="$key" '{ l = $0; sub(/#.*/, "", l); n = split(l, f) } !(n == 1 && f[1] == k)' upstream/exclude.txt > "$tmp/exclude.txt"
	mv "$tmp/exclude.txt" upstream/exclude.txt
done
sh scripts/sync-skills.sh >&2
sh scripts/check-refs.sh
