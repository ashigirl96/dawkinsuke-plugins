#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

run() {
	out=$("$@" 2>&1) || { echo "FAIL: $*" >&2; echo "$out" >&2; exit 1; }
}

run claude plugin validate .

places=$(sh scripts/ledger.sh --places)
# Claude Code はルートの skills/ を既定で読むので、plugin.json の skills にはそれ以外の置き場が並ぶ。
listed=$(jq -r '.skills[]' .claude-plugin/plugin.json | sed 's|^\./||' | sort)
[ "$listed" = "$(echo "$places" | grep -vx skills | sort)" ] || { echo "FAIL: plugin.json skills do not match the places in scripts/ledger.sh" >&2; echo "$listed" >&2; exit 1; }

# validate は symlink を辿らず、ルートからは plugin.json の skills で足したディレクトリも読まないので、実体を写した置き場ごとに見る。
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
for d in $places; do
	[ -d "$d" ] || continue
	mkdir -p "$tmp/$d"
	cp -RL "$d/." "$tmp/$d"
	run claude plugin validate --strict "$tmp/$d"
done

for d in mods/*/; do
	run claude plugin validate "$d"
	run claude plugin test "$d"
done

run sh scripts/sync-skills.sh
# pre-commit では変更が stage 済みなので、index から作業ツリーへの差分だけを見る。
drift=$(git status --porcelain -- $places | grep -v '^. ' || true)
[ -z "$drift" ] || { echo "FAIL: sync-skills.sh changed the checkout" >&2; echo "$drift" >&2; exit 1; }

run sh scripts/check-refs.sh
