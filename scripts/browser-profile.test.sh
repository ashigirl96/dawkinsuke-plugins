#!/bin/sh
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
script=$repo/skills/browser-profile/scripts/browser-profile.sh
tmp=$(mktemp -d)
trap 'for p in "$tmp"/t/*/pid; do [ -f "$p" ] && kill "$(cat "$p")" 2> /dev/null; done; rm -rf "$tmp"' EXIT

fail() { echo "FAIL: $1"; exit 1; }

root=$tmp/root
mkdir -p "$root/Profile 5/Sessions" "$root/Profile 5/Cache" "$root/Profile 5/Service Worker/CacheStorage" "$root/Profile 5/Local Storage"
echo state > "$root/Local State"
echo cookies > "$root/Profile 5/Cookies"
echo session > "$root/Profile 5/Sessions/Session_1"
echo encrypted > "$root/Profile 5/Sessions_Encrypted"
echo cache > "$root/Profile 5/Cache/data"
echo storage > "$root/Profile 5/Local Storage/leveldb"
printf '{"profile":{"exit_type":"Crashed"}}' > "$root/Profile 5/Preferences"

mkdir "$tmp/bin"
cat > "$tmp/bin/agent-browser" <<EOF
#!/bin/sh
echo "\$*" >> "$tmp/ab.log"
case "\$*" in
	profiles) printf 'Chrome profiles (%s):\n\n  Profile 5  (Personal)\n' "$root" ;;
	"--json profiles") echo '{"data":[{"directory":"Profile 5","name":"Personal"}],"success":true}' ;;
	*" get url") echo https://example.test/ ;;
esac
EOF
cat > "$tmp/browser" <<EOF
#!/bin/sh
printf '%s\n' "\$@" > "$tmp/browser.args"
for a in "\$@"; do
	case \$a in --user-data-dir=*) dir=\${a#--user-data-dir=} ;; esac
done
printf '1234\n/devtools/browser/x\n' > "\$dir/DevToolsActivePort"
exec sleep 300
EOF
chmod +x "$tmp/bin/agent-browser" "$tmp/browser"

export PATH="$tmp/bin:$PATH" TMPDIR="$tmp/t" AGENT_BROWSER_EXECUTABLE_PATH="$tmp/browser"
mkdir "$TMPDIR"
dest=$TMPDIR/browser-profile-s1

out=$(sh "$script" launch Personal s1 https://example.test/)
[ "$out" = https://example.test/ ] || fail "launch did not print the page URL: $out"

[ -f "$dest/Local State" ] || fail "Local State not copied"
[ -f "$dest/Profile 5/Cookies" ] || fail "Cookies not copied"
[ -f "$dest/Profile 5/Local Storage/leveldb" ] || fail "Local Storage not copied"
for gone in Sessions Sessions_Encrypted Cache "Service Worker"; do
	[ ! -e "$dest/Profile 5/$gone" ] || fail "$gone copied"
done
cmp -s "$root/Profile 5/Preferences" "$dest/Profile 5/Preferences" || fail "Preferences changed"

grep -qxF -- "--user-data-dir=$dest" "$tmp/browser.args" || fail "browser not started on the copy"
grep -qxF -- "--profile-directory=Profile 5" "$tmp/browser.args" || fail "profile directory not passed"
grep -qxF -- "--headless=new" "$tmp/browser.args" || fail "browser not headless"
grep -qxF -- "https://example.test/" "$tmp/browser.args" || fail "URL not passed to the browser"
grep -qxF -- "--session s1 --cdp ws://127.0.0.1:1234/devtools/browser/x wait --load load" "$tmp/ab.log" || fail "agent-browser not attached over CDP"

pid=$(cat "$dest/pid")
kill -0 "$pid" 2> /dev/null || fail "browser not running after launch"
sh "$script" launch Personal s1 2> /dev/null && fail "second launch of the same session accepted"

sh "$script" launch Personal s3 --gpu-launcher=x 2> "$tmp/err" && fail "option-like url accepted"
grep -qF "unsupported url: --gpu-launcher=x" "$tmp/err" || fail "option-like url not named in the error"
[ ! -e "$TMPDIR/browser-profile-s3" ] || fail "copy made for a rejected url"

sh "$script" launch Nobody s2 2> "$tmp/err" && fail "unknown profile accepted"
grep -qF "profile not found: Nobody" "$tmp/err" || fail "unknown profile not named in the error"

sh "$script" launch --headed Personal s4 > /dev/null
grep -qxF -- "--user-data-dir=$TMPDIR/browser-profile-s4" "$tmp/browser.args" || fail "headed browser not started on the copy"
grep -qF -- "--headless" "$tmp/browser.args" && fail "--headed launch still headless"
sh "$script" cleanup s4
sh "$script" launch --headed Personal 2> /dev/null && fail "--headed launch without a session accepted"

sh "$script" cleanup s1
grep -qxF -- "--session s1 close" "$tmp/ab.log" || fail "session not closed"
sleep 0.2
kill -0 "$pid" 2> /dev/null && fail "browser still running after cleanup"
[ ! -e "$dest" ] || fail "copy left after cleanup"

echo OK
