#!/bin/sh
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -R "$repo" "$tmp/r"
cd "$tmp/r"

fail() { echo "FAIL: $1"; exit 1; }
setup=matt/skills/setup-matt-pocock-skills/SKILL.md
reader=pstack/skills/bro/SKILL.md

sh scripts/check-refs.sh > out || true
grep -q '\.\./implement/SKILL.md' out && fail "reference through a symlinked sibling was reported"
grep -q 'src/billing' out && fail "path inside a code fence was reported"
grep -q 'learning-records' out && fail "working-directory path was reported"
grep -q ': how$' out && fail "bold emphasis was reported as a skill"
grep -q ': pr$' out && fail "upstream name of a renamed skill was reported"

echo mattpocock-skills/implement >> upstream/exclude.txt
sh scripts/sync-skills.sh > /dev/null
status=0
sh scripts/check-refs.sh > out || status=$?
[ "$status" = 1 ] || fail "findings did not exit 1 (got $status)"
grep -qx "missing-file $setup: ../implement/SKILL.md" out || fail "missing sibling file not reported"
grep -qx "missing-skill $setup: implement" out || fail "missing skill not reported"

echo 'Read [the adapter](../../docs/harness/claude-code.md).' >> $reader
rm -r pstack/docs/harness
sh scripts/check-refs.sh > out || true
grep -qx "missing-file $reader: ../../docs/harness/claude-code.md" out || fail "missing pstack doc not reported"

for n in figure-it-out principle-encode-lessons-in-structure blast-radius unslop poteto-mode; do
	echo "cursor-plugins/$n" >> upstream/exclude.txt
done
sh scripts/sync-skills.sh > /dev/null
grilling=matt/skills/grilling/SKILL.md
echo 'Then type /dawkinsuke:unslop.' >> $grilling
sh scripts/check-refs.sh > out || true
grep -qx "missing-skill $grilling: unslop" out || fail "skill named with the plugin prefix not reported"
echo mattpocock-skills/pr >> upstream/exclude.txt
rm -r matt/skills/pull-request
echo 'Then type /pull-request.' >> $grilling
sh scripts/check-refs.sh > out || true
grep -qx "missing-skill $grilling: pull-request" out || fail "skill named by its new name not reported"
cp upstream/exclude.txt exclude.before
sh scripts/try-include.sh cursor-plugins/figure-it-out > out 2> /dev/null || true
cmp -s upstream/exclude.txt exclude.before || fail "try-include changed the checkout"
[ ! -e pstack/skills/figure-it-out ] || fail "try-include linked into the checkout"
fio=pstack/skills/figure-it-out/SKILL.md
grep -qx "missing-skill $fio: principle-encode-lessons-in-structure" out || fail "principle skill named without its prefix not reported"
grep -qx "missing-skill $fio: poteto-mode" out || fail "skill named in bold not reported"

sh scripts/try-include.sh cursor-plugins/blast-radius > out 2> /dev/null || true
grep -qx "missing-skill pstack/skills/blast-radius/SKILL.md: unslop" out || fail "skill named in backticks not reported"

sh scripts/try-include.sh cursor-plugins/poteto-mode > out 2> /dev/null || true
grep -q '<name>' out && fail "placeholder path was reported"
grep -q ': url$' out && fail "placeholder link target was reported"

echo ok
