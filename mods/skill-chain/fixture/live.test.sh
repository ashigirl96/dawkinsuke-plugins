#!/bin/sh
# Checks live.sh's verdicts against a fake claude that replays canned transcripts; no model is called.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

fail() { echo "FAIL: $1"; exit 1; }

mkdir "$tmp/bin"
cat > "$tmp/bin/claude" <<'FAKE'
#!/bin/sh
echo '{"type":"system","subtype":"init","session_id":"s1"}'
case $FAKE in
chained) echo '{"name":"Skill","input":{"skill":"chainfix:callee"}}'; echo '{"name":"Skill","input":{"skill":"deep"}}' ;;
skipped) echo '{"type":"assistant","text":"I will do it myself."}' ;;
refused) echo '{"name":"Skill","input":{"skill":"chainfix:callee"}}'; echo 'Skill chainfix:callee cannot be used with Skill tool due to disable-model-invocation.' ;;
cut) echo '{"type":"result","subtype":"error_max_turns"}'; exit 0 ;;
esac
echo '{"type":"result","subtype":"success"}'
FAKE
chmod +x "$tmp/bin/claude"
live() { FAKE=$1 PATH="$tmp/bin:$PATH" sh "$here/live.sh" -n 1 -o "$tmp/out-$1" "$2" 'go' > "$tmp/$1.out" 2>&1; }

live chained callee,deep || fail "called and not refused should pass"
grep -q 'run 1: GREEN ends=\[success\]' "$tmp/chained.out" || fail "green line not printed"
live skipped callee && fail "a skill the model never called should fail"
grep -q 'run 1: RED' "$tmp/skipped.out" || fail "skipped call not marked red"
live refused callee && fail "a refused skill expected to run should fail"
live refused '!callee' || fail "a refused skill expected to be refused should pass"
live chained '!deep' && fail "a skill expected to be refused that ran should fail"
live cut callee && fail "a cut-off run should fail"
grep -q 'ends=\[error_max_turns\]' "$tmp/cut.out" || fail "cut-off turn not shown"
FAKE=chained PATH="$tmp/bin:$PATH" sh "$here/live.sh" -n 1 -o "$tmp/two" callee 'go' 'next' > "$tmp/two.out" || fail "a second turn broke the run"
grep -q 'ends=\[success success\]' "$tmp/two.out" || fail "both turns not shown"
[ -f "$tmp/two/run1-t2.jsonl" ] || fail "second turn transcript not kept"
echo ok
