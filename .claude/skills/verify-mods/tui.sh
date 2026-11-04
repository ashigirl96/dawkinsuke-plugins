#!/bin/sh
# Drives one Claude Code TUI in its own tmux session named vmods-<name>.
set -eu

usage() {
	echo "usage: tui.sh start <name> <claude args...> | send <name> <text> | key <name> <tmux key> | wait <name> <ERE> [seconds] | turn <name> <n> [seconds] | shot <name> <file> | stop <name>" >&2
	exit 2
}

[ $# -ge 2 ] || usage
cmd=$1
s=vmods-$2
shift 2

screen() { tmux capture-pane -p -t "$s" -S -; }

# Waits until at least <count> lines of the screen match <ERE>.
wait_for() {
	n=0
	until [ "$(screen | grep -Ec -- "$1")" -ge "${3:-1}" ]; do
		n=$((n + 1))
		[ "$n" -le "$2" ] || { echo "timeout: /$1/ x${3:-1} not on $s" >&2; return 1; }
		sleep 1
	done
}

case $cmd in
start)
	if tmux has-session -t "$s" 2>/dev/null; then echo "$s already exists; pick another name" >&2; exit 1; fi
	cd "$(git rev-parse --show-toplevel)"
	# 200 columns so the glossary side pane gets placed instead of falling back to chat.
	tmux new-session -d -s "$s" -x 200 -y 50 claude "$@"
	wait_for '^❯' 60
	;;
send)
	[ $# -eq 1 ] || usage
	# A post-turn dialog (e.g. "Teach auto mode ...") focuses its numbered choices and would swallow the text.
	if tmux capture-pane -p -t "$s" | grep -Eq '^ +❯ 1\. '; then
		tmux send-keys -t "$s" Escape
		sleep 1
	fi
	tmux send-keys -t "$s" -l "$1"
	sleep 0.5
	tmux send-keys -t "$s" Enter
	;;
key)
	[ $# -eq 1 ] || usage
	tmux send-keys -t "$s" "$1"
	;;
wait)
	[ $# -ge 1 ] || usage
	wait_for "$1" "${2:-120}"
	;;
turn)
	[ $# -ge 1 ] || usage
	# Each finished model turn prints "✻ <verb> for 5s · done 1:01 AM".
	wait_for '· done [0-9]+:[0-9]{2}' "${2:-180}" "$1"
	;;
shot)
	[ $# -eq 1 ] || usage
	screen >"$1"
	;;
stop)
	tmux kill-session -t "$s"
	;;
*) usage ;;
esac
