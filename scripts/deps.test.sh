#!/bin/sh
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -R "$repo" "$tmp/r"
cd "$tmp/r"

fail() { echo "FAIL: $1"; exit 1; }

for n in figure-it-out show-me-your-work principle-encode-lessons-in-structure; do
	echo "cursor-plugins/$n" >> upstream/exclude.txt
done
sh scripts/sync-skills.sh > /dev/null

sh scripts/deps.sh cursor-plugins/figure-it-out > out
head -1 out | grep -qxF 'figure-it-out  cursor-plugins  (excluded)' || fail "root not marked excluded"
grep -qxF '├─ ../../docs/harness/claude-code.md' out || fail "pstack doc not listed relative to the skill"
grep -qF '../<name>/SKILL.md' out && fail "placeholder path listed"
grep -qF '◇ show-me-your-work  (excluded)' out || fail "skill named in bold not listed"
grep -qF '◇ principle-encode-lessons-in-structure  (excluded)' out || fail "principle skill named without its prefix not listed"
grep -qF '◇ tdd  (excluded)' out || fail "same-name skill not taken from the caller's submodule"
grep -qF 'mattpocock-skills' out && fail "pstack skill resolved into matt's skills"

echo '[gone](../no-such-skill/SKILL.md)' >> upstream/cursor-plugins/harness/pstack/claude-code/skills/figure-it-out/SKILL.md
sh scripts/deps.sh cursor-plugins/figure-it-out > out
grep -qF '✗ ../no-such-skill/SKILL.md  missing, from SKILL.md' out || fail "unresolved file not marked"

sh scripts/deps.sh mattpocock-skills/setup-matt-pocock-skills > out
grep -qxF '│  └─↺ setup-matt-pocock-skills' out || fail "cycle back to the root not cut"
grep -qxF '└─◆ wayfinder' out || fail "last child not drawn with a closing branch"
grep -q '─ SKILL.md$' out && fail "link back to the skill's own SKILL.md listed"

sh scripts/deps.sh upstream/mattpocock-skills/skills/engineering/setup-matt-pocock-skills/ | cmp -s - out || fail "upstream directory gave a different tree from its key"

sh scripts/deps.sh pstack/skills/create-verification-skill > out
grep -qF '─ references/feature-map-example/' out || fail "referenced directory not marked with a slash"

fork=matt/skills/setup-matt-pocock-skills
sh scripts/deps.sh "$fork" > out
head -1 out | grep -qxF 'setup-matt-pocock-skills  matt/skills' || fail "checkout directory not used as the root"
grep -qxF '├─ ../implement/SKILL.md' out || fail "file added by the fork not listed"
grep -qxF '├─◆ implement' out || fail "skill added by the fork not taken from the checkout"

grep -vx -e mattpocock-skills/implement -e cursor-plugins/figure-it-out -e cursor-plugins/principle-encode-lessons-in-structure upstream/exclude.txt > exclude.txt
echo mattpocock-skills/implement >> exclude.txt
mv exclude.txt upstream/exclude.txt
sh scripts/sync-skills.sh > /dev/null
sh scripts/deps.sh "$fork" > out
grep -qF '─◇ implement  mattpocock-skills  (excluded)' out || fail "skill missing from the checkout not taken from upstream"
sh scripts/deps.sh pstack/skills/figure-it-out > out
grep -q '─◆ principle-encode-lessons-in-structure$' out || fail "principle skill in the checkout not found by its short name"

status=0
sh scripts/deps.sh mattpocock-skills/no-such-skill 2> /dev/null || status=$?
[ "$status" = 2 ] || fail "unknown skill did not exit 2 (got $status)"

echo ok
