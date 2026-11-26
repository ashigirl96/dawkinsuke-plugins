#!/bin/sh
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/r/scripts"
cp "$repo/scripts/ledger.sh" "$tmp/r/scripts/"
cd "$tmp/r"

fail() { echo "FAIL: $1"; exit 1; }
m=upstream/mattpocock-skills/skills
p=upstream/pstack-claude/plugins/pstack/skills

mkdir -p $m/engineering/tdd $m/engineering/pr $m/engineering/prototype $m/engineering/wizard $m/engineering/zoom \
	$m/productivity/handoff $m/productivity/teach $m/productivity/wait $m/productivity/principle-encode $m/misc/scaffold \
	$p/tdd $p/bro skills/walkthrough matt/skills/wizard pstack/skills
touch $m/engineering/README.md
mkdir matt/skills/pull-request matt/skills/old
printf -- '---\nupstream: skills/engineering/pr\nown: []\n---\n' > matt/skills/pull-request/ADR.md
printf -- '---\nupstream: skills/engineering/removed\nown: []\n---\n' > matt/skills/old/ADR.md
ln -s ../../$m/engineering/tdd matt/skills/stale
printf '%s\n' '# comment' 'mattpocock-skills/teach  # inline comment' > upstream/exclude.txt
printf '%s\n' '# comment' 'mattpocock-skills/handoff prototype' 'mattpocock-skills/zoom wait' > upstream/rename.txt

sh scripts/ledger.sh > out
tr '|' '\t' <<EOT | LC_ALL=C sort > want
bro|symlink|pstack/skills|pstack-claude/bro|$p/bro|use|bro
old|fork|matt/skills|mattpocock-skills/removed|$m/engineering/removed|gone|old,removed
principle-encode|symlink|matt/skills|mattpocock-skills/principle-encode|$m/productivity/principle-encode|use|principle-encode,encode
prototype|symlink|matt/skills|mattpocock-skills/handoff|$m/productivity/handoff|conflict|prototype,handoff
prototype|symlink|matt/skills|mattpocock-skills/prototype|$m/engineering/prototype|use|prototype
pull-request|fork|matt/skills|mattpocock-skills/pr|$m/engineering/pr|use|pull-request,pr
scaffold|-|-|mattpocock-skills/scaffold|$m/misc/scaffold|outside|scaffold
tdd|symlink|matt/skills|mattpocock-skills/tdd|$m/engineering/tdd|use|tdd
tdd|symlink|pstack/skills|pstack-claude/tdd|$p/tdd|conflict|tdd
teach|-|matt/skills|mattpocock-skills/teach|$m/productivity/teach|excluded|teach
wait|symlink|matt/skills|mattpocock-skills/wait|$m/productivity/wait|use|wait
wait|symlink|matt/skills|mattpocock-skills/zoom|$m/engineering/zoom|conflict|wait,zoom
walkthrough|own|skills|-|-|use|walkthrough
wizard|-|matt/skills|-|-|no-adr|wizard
wizard|symlink|matt/skills|mattpocock-skills/wizard|$m/engineering/wizard|conflict|wizard
EOT
diff want out > diff.out || fail "ledger differs from the fixture's rows: $(cat diff.out)"

sh scripts/ledger.sh wait | cut -f4 | tr '\n' ' ' | grep -qx 'mattpocock-skills/wait mattpocock-skills/zoom ' || fail "name did not find every row with that name"
[ "$(sh scripts/ledger.sh handoff | cut -f4)" = mattpocock-skills/handoff ] || fail "upstream name of a renamed skill not found"
[ "$(sh scripts/ledger.sh mattpocock-skills/pr | cut -f1)" = pull-request ] || fail "key of a fork not found"
[ "$(sh scripts/ledger.sh encode | cut -f1)" = principle-encode ] || fail "principle skill not found by its short name"
[ -z "$(sh scripts/ledger.sh no-such-skill)" ] || fail "unknown name gave rows"
sh scripts/ledger.sh | sh scripts/ledger.sh - teach tdd | cmp -s - "$(sh scripts/ledger.sh teach tdd > piped; echo piped)" || fail "table from stdin gave other rows"

printf '%s\n' skills matt/skills pstack/skills > want
sh scripts/ledger.sh --places | diff want - > diff.out || fail "places differ: $(cat diff.out)"
rm -r skills/walkthrough
sh scripts/ledger.sh --places | grep -qx skills || fail "place without rows dropped from places"

rm -r upstream/mattpocock-skills
status=0
sh scripts/ledger.sh > /dev/null 2>&1 || status=$?
[ "$status" = 2 ] || fail "missing upstream did not exit 2 (got $status)"

echo ok
