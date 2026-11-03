#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

run() {
	out=$("$@" 2>&1) || { echo "FAIL: $*" >&2; echo "$out" >&2; exit 1; }
}

run claude plugin validate .

# validate は symlink を辿らず、ルートからは plugin.json の skills で足したディレクトリも読まないので、実体を写した置き場ごとに見る。
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
for d in skills matt/skills pstack/skills; do
	[ -d "$d" ] || continue
	mkdir -p "$tmp/$d"
	cp -RL "$d/." "$tmp/$d"
	run claude plugin validate --strict "$tmp/$d"
done

# plugin test はルートより下の *.test.ts をすべて拾い、upstream のスキルの test まで走らせるので、mod の分だけ写して流す。
mkdir -p "$tmp/mod"
cp -R .claude-plugin hooks types "$tmp/mod"
rm -rf "$tmp/mod/.claude-plugin/types"
run claude plugin test "$tmp/mod"

run sh scripts/sync-skills.sh
# pre-commit では変更が stage 済みなので、index から作業ツリーへの差分だけを見る。
drift=$(git status --porcelain -- skills matt pstack | grep -v '^. ' || true)
[ -z "$drift" ] || { echo "FAIL: sync-skills.sh changed the checkout" >&2; echo "$drift" >&2; exit 1; }

run sh scripts/check-refs.sh
