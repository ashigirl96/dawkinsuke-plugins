#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
out=$(mktemp)
trap 'rm -f "$out"' EXIT

fail() { echo "FAIL: $1"; exit 1; }

sh scripts/deps.sh cursor-plugins/figure-it-out > "$out"
head -1 "$out" | grep -qxF 'figure-it-out  cursor-plugins  (excluded)' || fail "root not marked excluded"
grep -qxF '├─ ../../docs/harness/claude-code.md' "$out" || fail "pstack doc not listed relative to the skill"
grep -qF '✗ ../<name>/SKILL.md  missing, from SKILL.md' "$out" || fail "unresolved file not marked"
grep -qF '◇ show-me-your-work  (excluded)' "$out" || fail "skill named in bold not listed"
grep -qF '◇ principle-encode-lessons-in-structure  (excluded)' "$out" || fail "principle skill named without its prefix not listed"
grep -qF '◇ tdd  (excluded)' "$out" || fail "same-name skill not taken from the caller's submodule"
grep -qF 'mattpocock-skills' "$out" && fail "pstack skill resolved into matt's skills"

sh scripts/deps.sh mattpocock-skills/setup-matt-pocock-skills > "$out"
grep -qxF '│  └─↺ setup-matt-pocock-skills' "$out" || fail "cycle back to the root not cut"
grep -qxF '└─◆ wayfinder' "$out" || fail "last child not drawn with a closing branch"

sh scripts/deps.sh upstream/mattpocock-skills/skills/engineering/setup-matt-pocock-skills/ | cmp -s - "$out" || fail "upstream directory gave a different tree from its key"

fork=matt/skills/setup-matt-pocock-skills
sh scripts/deps.sh "$fork" > "$out"
head -1 "$out" | grep -qxF 'setup-matt-pocock-skills  matt/skills' || fail "checkout directory not used as the root"
grep -qxF '├─ ../implement/SKILL.md' "$out" || fail "file added by the fork not listed"
grep -qxF '├─◆ implement' "$out" || fail "skill added by the fork not taken from the checkout"

tmp=$(mktemp -d)
trap 'rm -rf "$out" "$tmp"' EXIT
cp -R . "$tmp/r"
(
	cd "$tmp/r"
	echo mattpocock-skills/implement >> upstream/exclude.txt
	sh scripts/sync-skills.sh > /dev/null
	sh scripts/deps.sh "$fork" | grep -qF '─◇ implement  mattpocock-skills  (excluded)'
) || fail "skill missing from the checkout not taken from upstream"

status=0
sh scripts/deps.sh mattpocock-skills/no-such-skill 2> /dev/null || status=$?
[ "$status" = 2 ] || fail "unknown skill did not exit 2 (got $status)"

echo ok
