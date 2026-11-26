#!/bin/sh
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -R "$repo" "$tmp/r"
cd "$tmp/r"

fail() { echo "FAIL: $1"; exit 1; }
setup=matt/skills/setup-matt-pocock-skills/SKILL.md

sh scripts/check-refs.sh > out || true
grep -q '\.\./implement/SKILL.md' out && fail "reference through a symlinked sibling was reported"
grep -q 'src/billing' out && fail "path inside a code fence was reported"
grep -q 'learning-records' out && fail "working-directory path was reported"
grep -q '\.\./\.claude' out && fail "hidden directory of another tool was reported"
grep -q ': pr$' out && fail "upstream name of a renamed skill was reported"

echo mattpocock-skills/implement >> upstream/exclude.txt
sh scripts/sync-skills.sh > /dev/null
status=0
sh scripts/check-refs.sh > out || status=$?
[ "$status" = 1 ] || fail "findings did not exit 1 (got $status)"
grep -qx "missing-file $setup: ../implement/SKILL.md" out || fail "missing sibling file not reported"
grep -qx "missing-skill $setup: implement" out || fail "missing skill not reported"

grilling=matt/skills/grilling/SKILL.md
echo 'Then type /dawkinsuke:grill-me.' >> $grilling
sh scripts/check-refs.sh > out || true
grep -qx "missing-skill $grilling: grill-me" out || fail "skill named with the plugin prefix not reported"
echo mattpocock-skills/pr >> upstream/exclude.txt
rm -r matt/skills/pull-request
echo 'Then type /pull-request.' >> $grilling
sh scripts/check-refs.sh > out || true
grep -qx "missing-skill $grilling: pull-request" out || fail "skill named by its new name not reported"

printf '%s\n' 'Then run the **grill-me** skill.' 'Hand off to `ask-matt`.' 'Read `../<name>/SKILL.md` and [the page](url).' >> upstream/mattpocock-skills/skills/productivity/wait-what/SKILL.md
sed 's|^mattpocock-skills/wait-what$|& # why|' upstream/exclude.txt > exclude.txt && mv exclude.txt upstream/exclude.txt
cp upstream/exclude.txt exclude.before
sh scripts/try-include.sh mattpocock-skills/wait-what > out 2> /dev/null || true
cmp -s upstream/exclude.txt exclude.before || fail "try-include changed the checkout"
[ ! -e matt/skills/wait-what ] || fail "try-include linked into the checkout"
ww=matt/skills/wait-what/SKILL.md
grep -qx "missing-skill $ww: grill-me" out || fail "skill named in bold not reported"
grep -qx "missing-skill $ww: ask-matt" out || fail "skill named in backticks not reported"
grep -q '<name>' out && fail "placeholder path was reported"
grep -q ': url$' out && fail "placeholder link target was reported"

echo ok
