#!/bin/sh
set -eu
cd "$(dirname "$0")"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

cat > "$tmp/good.md" <<'EOF'
# pstack model configuration

arena runners: opus @xhigh, gpt-6.1-sol
arena cross-judge pool: opus @xhigh, gpt-6.1-sol
architect runners: opus, opus @max
interrogate reviewers: opus @xhigh, gpt-6.1-sol
swarm workers: gpt-6.1-sol
how explorer: gpt-6.1-sol
how explainer: opus @xhigh
why investigators: gpt-6.1-sol
why synthesizer: opus @xhigh
reflect tooling: auto
reflect judgment, divergent, synthesizer: inherit-parent

default effort: session
EOF

expect() {
	got=$(sh check-sheet.sh "$1" 2>&1) && code=0 || code=$?
	[ "$code" = "$2" ] && [ "$got" = "$3" ] || { echo "FAIL: $1: got $code '$got', want $2 '$3'" >&2; exit 1; }
}

# A panel may name models from one vendor only.
expect "$tmp/good.md" 0 "sheet ok"

grep -v '^how explorer' "$tmp/good.md" > "$tmp/missing.md"
expect "$tmp/missing.md" 1 'sheet invalid: missing role `how explorer`'

sed 's/^swarm workers: .*/swarm workers: Opus 5/' "$tmp/good.md" > "$tmp/bad-model.md"
expect "$tmp/bad-model.md" 1 'sheet invalid: `swarm workers` has an entry that is not a model ID'

sed 's/^default effort: .*/default effort: huge/' "$tmp/good.md" > "$tmp/bad-effort.md"
expect "$tmp/bad-effort.md" 1 'sheet invalid: default effort is not session or a level'

printf '\357\273\277' > "$tmp/crlf.md"
sed "s/\$/$(printf '\r')/" "$tmp/good.md" >> "$tmp/crlf.md"
expect "$tmp/crlf.md" 0 "sheet ok"

expect "$tmp/none.md" 1 "sheet invalid: cannot read $tmp/none.md"
echo ok
