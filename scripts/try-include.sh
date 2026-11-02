#!/bin/sh
# 引数のスキルを除外から外した写しで check-refs.sh を流す。checkout は変えない。
set -eu
[ $# -gt 0 ] || { echo "usage: sh scripts/try-include.sh <submodule>/<name>..." >&2; exit 2; }
repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -R "$repo" "$tmp/r"
cd "$tmp/r"
for key in "$@"; do
	grep -qx "$key" upstream/exclude.txt || { echo "error $key is not in upstream/exclude.txt" >&2; exit 2; }
	grep -vx "$key" upstream/exclude.txt > "$tmp/exclude.txt" || true
	mv "$tmp/exclude.txt" upstream/exclude.txt
done
sh scripts/sync-skills.sh >&2
sh scripts/check-refs.sh
