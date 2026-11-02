#!/bin/sh
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -R "$repo" "$tmp/r"
cd "$tmp/r"

fail() { echo "FAIL: $1"; exit 1; }

echo wait-what > upstream/exclude.txt
ln -sfn ../upstream/mattpocock-skills/skills/productivity/wait-what skills/wait-what
sh scripts/sync-skills.sh > out
[ ! -e skills/wait-what ] || fail "excluded skill is still linked"
grep -qx 'removed wait-what (excluded)' out || fail "removal not reported"

: > upstream/exclude.txt
sh scripts/sync-skills.sh > out
[ -L skills/wait-what ] || fail "un-excluded skill was not linked"

rm skills/tdd
mkdir skills/tdd && touch skills/tdd/ADR.md
ln -sfn ../upstream/mattpocock-skills/skills/engineering/nope skills/gone
ln -sfn ../upstream/mattpocock-skills/skills/productivity/tdd skills/code-review
sh scripts/sync-skills.sh > out
[ ! -L skills/tdd ] || fail "fork was replaced by a symlink"
[ ! -L skills/gone ] || fail "broken symlink was kept"
[ "$(readlink skills/code-review)" = ../upstream/mattpocock-skills/skills/engineering/code-review ] || fail "wrong symlink was not relinked"

sh scripts/sync-skills.sh > out
[ ! -s out ] || fail "second run was not a no-op: $(cat out)"

echo ok
