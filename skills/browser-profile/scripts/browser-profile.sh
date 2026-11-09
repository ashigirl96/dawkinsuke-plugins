#!/bin/sh
# usage:
#   browser-profile.sh launch <表示名|ディレクトリ名> <session> [url]
#   browser-profile.sh cleanup <session>
set -eu

copy_dir() {
	printf '%s/browser-profile-%s' "${TMPDIR:-/tmp}" "$1" | tr -s /
}

resolve_root() {
	agent-browser profiles | sed -n '1s/^[^(]*(\(.*\)):$/\1/p'
}

resolve_dir() {
	agent-browser --json profiles | jq -er --arg n "$1" 'first(.data[] | select(.name == $n or .directory == $n) | .directory)'
}

browser_exe() {
	if [ -n "${AGENT_BROWSER_EXECUTABLE_PATH:-}" ]; then
		echo "$AGENT_BROWSER_EXECUTABLE_PATH"
		return
	fi
	case $1 in
		*/BraveSoftware/*) echo "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" ;;
		*) echo "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ;;
	esac
}

launch() {
	name=$1 session=$2 url=${3:-about:blank}
	# 先頭が - の文字列はブラウザに起動 option として読まれるので、開く URL の形に絞る。
	case $url in http://*|https://*|about:blank) ;; *) echo "unsupported url: $url" >&2; exit 2 ;; esac
	root=$(resolve_root)
	[ -n "$root" ] || { echo "agent-browser profiles printed no profile root" >&2; exit 1; }
	dir=$(resolve_dir "$name") || { echo "profile not found: $name" >&2; exit 1; }
	exe=$(browser_exe "$root")
	dest=$(copy_dir "$session")
	[ ! -e "$dest/pid" ] || { echo "already launched: $session (run cleanup first)" >&2; exit 1; }

	rm -rf "$dest"
	mkdir -p "$dest/$dir"
	cp "$root/Local State" "$dest/Local State"
	# Sessions を写すと普段のウィンドウとタブが復元される。残りはログインに効かないキャッシュ。
	rsync -a \
		--exclude '/Sessions' --exclude '/Sessions_Encrypted' \
		--exclude '/Cache' --exclude '/Code Cache' --exclude '/Service Worker' \
		--exclude '/blob_storage' --exclude '/File System' --exclude '/GCM Store' \
		--exclude '/optimization_guide' --exclude '/ShaderCache' --exclude '/GPUCache' \
		"$root/$dir/" "$dest/$dir/"
	# Preferences の exit_type は Crashed のまま残す。正常終了の扱いだと、閉じると消える cookie（IAP の鍵など）が起動時に消される。

	# agent-browser の --profile <path> は --use-mock-keychain を足し、Keychain の鍵で暗号化された cookie が読めなくなるので、自分で起動して --cdp でつなぐ。
	"$exe" --user-data-dir="$dest" --profile-directory="$dir" --remote-debugging-port=0 --headless=new \
		--no-first-run --no-default-browser-check "$url" > "$dest/browser.log" 2>&1 &
	echo $! > "$dest/pid"

	i=0
	until [ -s "$dest/DevToolsActivePort" ]; do
		i=$((i + 1))
		[ $i -le 100 ] || { echo "browser opened no debugging port; see $dest/browser.log" >&2; exit 1; }
		sleep 0.1
	done
	port=$(sed -n 1p "$dest/DevToolsActivePort")
	path=$(sed -n 2p "$dest/DevToolsActivePort")
	agent-browser --session "$session" --cdp "ws://127.0.0.1:$port$path" wait --load load > /dev/null
	agent-browser --session "$session" get url
}

cleanup() {
	session=$1
	dest=$(copy_dir "$session")
	# --cdp でつないだセッションの close は切り離すだけなので、起動したブラウザは pid で止める。
	agent-browser --session "$session" close > /dev/null 2>&1 || true
	if [ -s "$dest/pid" ]; then
		kill "$(cat "$dest/pid")" 2> /dev/null || true
	fi
	rm -rf "$dest"
}

cmd=${1:-}
[ $# -gt 0 ] && shift
case $cmd in
	launch) [ $# -ge 2 ] || { echo "usage: $0 launch <profile> <session> [url]" >&2; exit 2; }; launch "$@" ;;
	cleanup) [ $# -eq 1 ] || { echo "usage: $0 cleanup <session>" >&2; exit 2; }; cleanup "$1" ;;
	*) echo "usage: $0 launch|cleanup ..." >&2; exit 2 ;;
esac
