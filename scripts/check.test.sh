#!/bin/sh
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -R "$repo" "$tmp/r"
cd "$tmp/r"

fail() { echo "FAIL: $1"; exit 1; }

sh scripts/check.sh || fail "clean checkout did not pass"

skill=upstream/cursor-plugins/harness/pstack/claude-code/skills/create-verification-skill/SKILL.md
cp "$skill" skill.before
printf -- '---\nname: [oops\n---\nbody\n' > "$skill"
sh scripts/check.sh 2> out && fail "broken frontmatter behind a pstack symlink passed"
grep -q 'create-verification-skill' out || fail "broken skill not named in the output"
cp skill.before "$skill"

echo mattpocock-skills/code-review >> upstream/exclude.txt
sh scripts/check.sh 2> out && fail "exclude.txt edited without syncing passed"
grep -q 'sync-skills.sh changed the checkout' out || fail "drift not reported"

echo ok
