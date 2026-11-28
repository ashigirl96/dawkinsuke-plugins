#!/bin/sh
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -R "$repo" "$tmp/r"
cd "$tmp/r"

fail() { echo "FAIL: $1"; exit 1; }

echo mattpocock-skills/wait-what > upstream/exclude.txt
ln -sfn ../../upstream/mattpocock-skills/skills/productivity/wait-what matt/skills/wait-what
sh scripts/sync-skills.sh > out
[ ! -e matt/skills/wait-what ] || fail "excluded skill is still linked"
grep -qx 'removed wait-what (excluded)' out || fail "removal not reported"

: > upstream/exclude.txt
sh scripts/sync-skills.sh > out
[ -L matt/skills/wait-what ] || fail "un-excluded skill was not linked"

ln -s ../upstream/mattpocock-skills/skills/engineering/tdd skills/tdd
sh scripts/sync-skills.sh > out
[ ! -e skills/tdd ] || fail "link in the wrong directory was kept"
[ -L matt/skills/tdd ] || fail "link in the right directory was removed"

rm matt/skills/tdd
mkdir matt/skills/tdd && printf -- '---\nupstream: skills/engineering/tdd\nown: []\n---\n' > matt/skills/tdd/ADR.md
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

echo 'mattpocock-skills/handoff hand-off' > upstream/rename.txt
sh scripts/sync-skills.sh > out
[ ! -e matt/skills/handoff ] || fail "old name of a renamed skill is still linked"
[ "$(readlink matt/skills/hand-off)" = ../../upstream/mattpocock-skills/skills/productivity/handoff ] || fail "renamed skill was not linked under its new name"

echo 'mattpocock-skills/handoff prototype' > upstream/rename.txt
sh scripts/sync-skills.sh > out
[ "$(readlink matt/skills/prototype)" = ../../upstream/mattpocock-skills/skills/engineering/prototype ] || fail "rename destination took over another skill's link"
grep -qx 'conflict prototype (matt/skills/prototype has the same name)' out || fail "rename collision not reported"
sh scripts/sync-skills.sh > out
grep -q relinked out && fail "rename collision relinked on every run"

echo 'nope/missing gone' > upstream/rename.txt
sh scripts/sync-skills.sh > out
grep -qx 'warning nope/missing in upstream/rename.txt is not an upstream skill' out || fail "unknown rename entry not warned"

echo ok
