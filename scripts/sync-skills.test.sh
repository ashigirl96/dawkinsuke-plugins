#!/bin/sh
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -R "$repo" "$tmp/r"
cd "$tmp/r"

fail() { echo "FAIL: $1"; exit 1; }
pstack=upstream/cursor-plugins/harness/pstack/claude-code/skills

echo mattpocock-skills/wait-what > upstream/exclude.txt
ln -sfn ../../upstream/mattpocock-skills/skills/productivity/wait-what matt/skills/wait-what
sh scripts/sync-skills.sh > out
[ ! -e matt/skills/wait-what ] || fail "excluded skill is still linked"
grep -qx 'removed wait-what (excluded)' out || fail "removal not reported"
[ "$(readlink matt/skills/tdd)" = ../../upstream/mattpocock-skills/skills/engineering/tdd ] || fail "same-named skill of another upstream was not kept"
[ ! -e pstack/skills/tdd ] || fail "a name clash was linked twice"
grep -qx 'conflict tdd (matt/skills/tdd has the same name)' out || fail "upstream name clash not reported"
[ "$(readlink pstack/skills/bro)" = "../../$pstack/bro" ] || fail "pstack skill was not linked under pstack/skills"

: > upstream/exclude.txt
sh scripts/sync-skills.sh > out
[ -L matt/skills/wait-what ] || fail "un-excluded skill was not linked"

echo mattpocock-skills/tdd > upstream/exclude.txt
sh scripts/sync-skills.sh > out
[ ! -e matt/skills/tdd ] || fail "excluded matt skill is still linked"
[ "$(readlink pstack/skills/tdd)" = "../../$pstack/tdd" ] || fail "excluding one upstream did not hand the name to the other"

printf '%s\n' cursor-plugins/tdd cursor-plugins/teach > upstream/exclude.txt
ln -sfn "../../$pstack/bro" matt/skills/bro
sh scripts/sync-skills.sh > out
[ -L matt/skills/tdd ] || fail "matt skill did not come back"
[ ! -e matt/skills/bro ] || fail "link in the wrong directory was kept"
[ -L pstack/skills/bro ] || fail "pstack link was removed"

rm matt/skills/tdd
mkdir matt/skills/tdd && touch matt/skills/tdd/ADR.md
ln -sfn ../../upstream/mattpocock-skills/skills/engineering/nope matt/skills/gone
ln -sfn ../../upstream/mattpocock-skills/skills/productivity/teach matt/skills/code-review
sh scripts/sync-skills.sh > out
[ ! -L matt/skills/tdd ] || fail "fork was replaced by a symlink"
[ ! -L matt/skills/gone ] || fail "broken symlink was kept"
[ "$(readlink matt/skills/code-review)" = ../../upstream/mattpocock-skills/skills/engineering/code-review ] || fail "wrong symlink was not relinked"

sh scripts/sync-skills.sh > out
[ ! -s out ] || fail "second run was not a no-op: $(cat out)"

rm matt/skills/wizard
mkdir -p skills/wizard && touch skills/wizard/SKILL.md
sh scripts/sync-skills.sh > out
[ ! -e matt/skills/wizard ] || fail "upstream skill was linked over an own skill"
grep -qx 'conflict wizard (skills/wizard has the same name)' out || fail "own skill name clash not reported"
rm -r skills

mkdir matt/skills/wizard
sh scripts/sync-skills.sh > out
grep -qx 'conflict wizard (matt/skills/wizard is a directory without ADR.md)' out || fail "directory without ADR.md not reported"

echo nope/missing > upstream/exclude.txt
sh scripts/sync-skills.sh > out
grep -qx 'warning nope/missing in upstream/exclude.txt is not an upstream skill' out || fail "unknown exclude entry not warned"

echo ok
