#!/bin/sh
# Runs real Claude Code headless with checkout's skill-chain and judges each run by the Skill tool calls in the transcript.
set -eu
usage() {
	cat >&2 <<'EOF'
usage: sh mods/skill-chain/fixture/live.sh [-n runs] [-m model] [-t max-turns] [-s skill-chain-dir] [-p plugin-dir]... [-C dir] [-o out-dir] <expect> <prompt> [<next prompt>...]
  <expect>  comma list: `name` must be called with the Skill tool and run, `!name` must be called and refused
  <prompt>  the first turn; each further argument is one more turn on the same session (--resume)
  -n 3  -m opus  -t 20  -s <repo root>/mods/skill-chain  -C <repo root>  -o <new temp dir>; -p adds a plugin dir (relative to the repo root)
EOF
	exit 2
}

repo=$(cd "$(dirname "$0")/../../.." && pwd)
runs=3 model=opus turns=20 dir=$repo out= chain=$repo/mods/skill-chain plugins=
while getopts n:m:t:s:p:C:o: opt; do
	case $opt in
	n) runs=$OPTARG ;;
	m) model=$OPTARG ;;
	t) turns=$OPTARG ;;
	s) chain=$OPTARG ;;
	p) case $OPTARG in /*) plugins="$plugins --plugin-dir $OPTARG" ;; *) plugins="$plugins --plugin-dir $repo/$OPTARG" ;; esac ;;
	C) dir=$OPTARG ;;
	o) out=$OPTARG ;;
	*) usage ;;
	esac
done
shift $((OPTIND - 1))
[ $# -ge 2 ] || usage
expect=$1
shift
plugins="--plugin-dir $chain$plugins"
[ -n "$out" ] || out=$(mktemp -d)
mkdir -p "$out"
cd "$dir"

# --setting-sources project keeps the user's installed plugins (and their skill-chain) out; Write/Edit/Bash stay off so a chained skill cannot publish anything.
called() { grep -qE "\"name\":\"Skill\",\"input\":\\{\"skill\":\"([^\"]*:)?$2\"" "$1"; }
refused() { grep -qE "Skill ([^ ]*:)?$2 cannot be used with Skill tool due to disable-model-invocation" "$1"; }

failed=0
i=0
while [ $i -lt "$runs" ]; do
	i=$((i + 1))
	all=$out/run$i.jsonl
	: > "$all"
	ends= sid= t=0
	for prompt in "$@"; do
		t=$((t + 1))
		if [ -z "$sid" ]; then
			res=$(claude -p --model "$model" --setting-sources project $plugins --disallowedTools Write Edit Bash NotebookEdit --max-turns "$turns" --output-format stream-json --verbose "$prompt" 2>&1 || true)
			sid=$(printf '%s\n' "$res" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4)
		else
			res=$(claude -p --model "$model" --setting-sources project $plugins --disallowedTools Write Edit Bash NotebookEdit --max-turns "$turns" --output-format stream-json --verbose --resume "$sid" "$prompt" 2>&1 || true)
		fi
		printf '%s\n' "$res" > "$out/run$i-t$t.jsonl"
		printf '%s\n' "$res" >> "$all"
		ends="$ends $(printf '%s\n' "$res" | grep -oE '"subtype":"(success|error[a-z_]*)"' | tail -1 | cut -d'"' -f4)"
	done

	verdict=GREEN
	for want in $(printf '%s' "$expect" | tr ',' ' '); do
		name=${want#!}
		if ! called "$all" "$name"; then
			verdict=RED
		elif [ "$want" = "$name" ] && refused "$all" "$name"; then
			verdict=RED
		elif [ "$want" != "$name" ] && ! refused "$all" "$name"; then
			verdict=RED
		fi
	done
	[ $verdict = GREEN ] || failed=1
	skills=$(grep -oE '"name":"Skill","input":\{"skill":"[^"]+"' "$all" | sed 's/.*"skill":"//; s/"$//' | tr '\n' ' ' || true)
	echo "run $i: $verdict ends=[${ends# }] refused=$(grep -c 'cannot be used with Skill tool due to disable-model-invocation' "$all" || true) skills: $skills"
done
echo "transcripts: $out"
exit $failed
