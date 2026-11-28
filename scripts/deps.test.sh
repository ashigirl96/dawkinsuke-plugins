#!/bin/sh
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -R "$repo" "$tmp/r"
cd "$tmp/r"

fail() { echo "FAIL: $1"; exit 1; }

ww=upstream/mattpocock-skills/skills/productivity/wait-what
mkdir $ww/examples
printf '%s\n' 'Then run the **grill-me** skill.' 'See [examples](examples/) and `../<name>/SKILL.md`.' '[gone](../no-such-skill/SKILL.md)' >> $ww/SKILL.md
sh scripts/deps.sh mattpocock-skills/wait-what > out
head -1 out | grep -qxF 'wait-what  mattpocock-skills  (excluded)' || fail "root not marked excluded"
grep -qF '../<name>/SKILL.md' out && fail "placeholder path listed"
grep -qF '◇ grill-me  (excluded)' out || fail "skill named in bold not listed"
grep -qF '─ examples/' out || fail "referenced directory not marked with a slash"
grep -qF '✗ ../no-such-skill/SKILL.md  missing, from SKILL.md' out || fail "unresolved file not marked"

sh scripts/deps.sh mattpocock-skills/setup-matt-pocock-skills > out
grep -qxF '│  └─↺ setup-matt-pocock-skills' out || fail "cycle back to the root not cut"
grep -qxF '└─◆ wayfinder' out || fail "last child not drawn with a closing branch"
grep -q '─ SKILL.md$' out && fail "link back to the skill's own SKILL.md listed"

sh scripts/deps.sh upstream/mattpocock-skills/skills/engineering/setup-matt-pocock-skills/ | cmp -s - out || fail "upstream directory gave a different tree from its key"

fork=matt/skills/setup-matt-pocock-skills
sh scripts/deps.sh "$fork" > out
head -1 out | grep -qxF 'setup-matt-pocock-skills  matt/skills' || fail "checkout directory not used as the root"
grep -qxF '├─ ../implement/SKILL.md' out || fail "file added by the fork not listed"
grep -qxF '├─◆ implement' out || fail "skill added by the fork not taken from the checkout"

echo mattpocock-skills/implement >> upstream/exclude.txt
sh scripts/sync-skills.sh > /dev/null
sh scripts/deps.sh "$fork" > out
grep -qF '─◇ implement  mattpocock-skills  (excluded)' out || fail "skill missing from the checkout not taken from upstream"

status=0
sh scripts/deps.sh mattpocock-skills/no-such-skill 2> /dev/null || status=$?
[ "$status" = 2 ] || fail "unknown skill did not exit 2 (got $status)"

sh scripts/deps.sh matt/skills/pull-request > out
grep -qF '◆ pr' out && fail "renamed skill listed itself under its upstream name"

echo ok
