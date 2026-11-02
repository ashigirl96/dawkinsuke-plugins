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
ln -sfn ../upstream/mattpocock-skills/skills/productivity/wait-what skills/wait-what
sh scripts/sync-skills.sh > out
[ ! -e skills/wait-what ] || fail "excluded skill is still linked"
grep -qx 'removed wait-what (excluded)' out || fail "removal not reported"
[ "$(readlink skills/tdd)" = ../upstream/mattpocock-skills/skills/engineering/tdd ] || fail "same-named skill of another upstream was not kept"
[ ! -e pstack/skills/tdd ] || fail "a name clash was linked twice"
grep -qx 'conflict tdd (skills/tdd has the same name)' out || fail "upstream name clash not reported"
[ "$(readlink pstack/skills/architect)" = "../../$pstack/architect" ] || fail "pstack skill was not linked under pstack/skills"

: > upstream/exclude.txt
sh scripts/sync-skills.sh > out
[ -L skills/wait-what ] || fail "un-excluded skill was not linked"

echo mattpocock-skills/tdd > upstream/exclude.txt
sh scripts/sync-skills.sh > out
[ ! -e skills/tdd ] || fail "excluded matt skill is still linked"
[ "$(readlink pstack/skills/tdd)" = "../../$pstack/tdd" ] || fail "excluding one upstream did not hand the name to the other"

printf '%s\n' cursor-plugins/tdd cursor-plugins/teach > upstream/exclude.txt
ln -sfn "../$pstack/architect" skills/architect
sh scripts/sync-skills.sh > out
[ -L skills/tdd ] || fail "matt skill did not come back"
[ ! -e skills/architect ] || fail "link in the wrong directory was kept"
[ -L pstack/skills/architect ] || fail "pstack link was removed"

rm skills/tdd
mkdir skills/tdd && touch skills/tdd/ADR.md
ln -sfn ../upstream/mattpocock-skills/skills/engineering/nope skills/gone
ln -sfn ../upstream/mattpocock-skills/skills/productivity/teach skills/code-review
sh scripts/sync-skills.sh > out
[ ! -L skills/tdd ] || fail "fork was replaced by a symlink"
[ ! -L skills/gone ] || fail "broken symlink was kept"
[ "$(readlink skills/code-review)" = ../upstream/mattpocock-skills/skills/engineering/code-review ] || fail "wrong symlink was not relinked"

sh scripts/sync-skills.sh > out
[ ! -s out ] || fail "second run was not a no-op: $(cat out)"

echo nope/missing > upstream/exclude.txt
sh scripts/sync-skills.sh > out
grep -qx 'warning nope/missing in upstream/exclude.txt is not an upstream skill' out || fail "unknown exclude entry not warned"

echo ok
