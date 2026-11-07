#!/bin/sh
# スキルが参照するファイルとスキルを、参照先のスキルもたどって木の形で出す。
set -eu
if [ $# -ne 1 ]; then
	cat >&2 <<'EOF'
usage: sh scripts/deps.sh <submodule>/<name> | <skill directory>
  <submodule>/<name> か upstream/ のディレクトリ: upstream の中だけをたどる
  skills/・matt/skills/・pstack/skills/ のディレクトリ: 呼ばれたスキルも checkout から先に探す（fork の違いが出る）
EOF
	exit 2
fi
if [ -d "$1" ]; then given=$(cd "$1" && pwd); else given=$1; fi
cd "$(dirname "$0")/.."
repo=$(pwd)
given=${given#"$repo"/}
ledger=$(sh scripts/ledger.sh)
. scripts/refs.sh

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
	bold=$(printf '\033[1m') dim=$(printf '\033[2m') red=$(printf '\033[31m') off=$(printf '\033[0m')
else
	bold= dim= red= off=
fi

dir_of() {
	echo "$ledger" | awk -F'\t' -v k="$1" '$4 == k { print $5; exit }'
}

# 木の節は upstream のスキルなら key、checkout のスキルならそのディレクトリ。
node_dir() {
	if [ -d "$1" ]; then echo "$1"; else dir_of "$1"; fi
}

is_excluded() {
	echo "$ledger" | awk -F'\t' -v k="$1" '$4 == k && $6 == "excluded" { found = 1 } END { exit !found }'
}

submodule_of() {
	if [ -d "$1" ]; then
		set -- "$(echo "$ledger" | awk -F'\t' -v d="$1" '$3 "/" $1 == d { print $4; exit }')"
	fi
	echo "${1%%/*}"
}

location_of() {
	if [ -d "$1" ]; then dirname "$1"; else echo "${1%%/*}"; fi
}

# 名前で呼ばれたスキルは、checkout を見るときは checkout から、次に呼んだ側と同じ submodule から探す。
resolve() {
	rows=$(echo "$ledger" | sh scripts/ledger.sh - "$2")
	[ -n "$rows" ] || return 0
	if [ "$mode" = checkout ]; then
		found=$(echo "$rows" | awk -F'\t' '$3 != "-" && $6 != "excluded" && $6 != "conflict" { print $3 "/" $1; exit }')
		if [ -n "$found" ]; then echo "$found"; return; fi
	fi
	echo "$rows" | awk -F'\t' -v s="$(submodule_of "$1")" '
		$4 != "-" {
			split($4, k, "/"); rank = k[1] == s ? 0 : k[1] == "mattpocock-skills" ? 1 : 2
			if (found == "" || rank < best) { best = rank; found = $4 }
		}
		END { if (found != "") print found }'
}

relative() {
	awk -v a="$1" -v b="$2" 'BEGIN {
		n = split(a, x, "/"); m = split(b, y, "/"); i = 1
		while (i <= n && i < m && x[i] == y[i]) i++
		for (j = i; j <= n; j++) s = s "../"
		for (j = i; j < m; j++) s = s y[j] "/"
		print s y[m]
	}'
}

# 各行: f <スキルからの相対 path>、x <見つからない参照> <参照元>、s <スキルの節>。
children() (
	dir=$(node_dir "$1")
	skill_docs "$dir" | while read -r f; do
		file_refs "$f" | while read -r ref; do
			if path=$(resolve_ref "$f" "$ref"); then
				rel=$(relative "$dir" "${path#"$repo"/}")
				# 自分の SKILL.md への link は戻り道で、依存ではない。
				if [ "$rel" = SKILL.md ]; then continue; fi
				if [ -d "$path" ]; then rel=$rel/; fi
				echo "f $rel"
			else
				echo "x $ref $(relative "$dir" "$f")"
			fi
		done
	done | sort -u
	skill_docs "$dir" | while read -r f; do skill_refs "$f"; done |
		while read -r name; do resolve "$1" "$name"; done | sort -u | grep -vx "$1" | sed 's/^/s /' || true
)

label() {
	out="${1##*/}"
	[ "$(location_of "$1")" = "$root_location" ] || out="$out  ${dim}$(location_of "$1")${off}"
	if is_excluded "$1"; then out="$out  ${dim}(excluded)${off}"; fi
	echo "$out"
}

walk() (
	kids=$(children "$1")
	[ -n "$kids" ] || exit 0
	last=$(echo "$kids" | wc -l)
	i=0
	echo "$kids" | while read -r kind item referrer; do
		i=$((i + 1))
		if [ "$i" -eq $last ]; then branch='└─' next="$2   "; else branch='├─' next="$2│  "; fi
		case $kind in
		f) echo "$2$branch $item" ;;
		x) echo "$2$branch ${red}✗ $item${off}  ${dim}missing, from $referrer${off}" ;;
		s)
			if grep -qx "$item" "$seen"; then
				echo "$2$branch${dim}↺ $(label "$item")${off}"
				continue
			fi
			echo "$item" >> "$seen"
			if is_excluded "$item"; then mark=◇; else mark=◆; fi
			echo "$2$branch$mark ${bold}$(label "$item")${off}"
			walk "$item" "$next"
			;;
		esac
	done
)

mode=upstream
root=$(echo "$ledger" | awk -F'\t' -v g="$given" '$4 != "-" && ($4 == g || $5 == g) { print $4; exit }')
if [ -z "$root" ] && [ -d "$given" ] && [ -n "$(echo "$ledger" | awk -F'\t' -v g="$given" '$3 "/" $1 == g')" ]; then
	root=$given mode=checkout
fi
[ -n "$root" ] || { echo "error $1 is not a skill in upstream or this checkout" >&2; exit 2; }
seen=$(mktemp)
trap 'rm -f "$seen"' EXIT
echo "$root" > "$seen"
# root_location が空のうちに出すので、根の行には場所が付く。
root_location=
echo "${bold}$(label "$root")${off}"
root_location=$(location_of "$root")
walk "$root" ""
[ -z "${off}" ] || echo "${dim}◆ スキル  ◇ 除外中のスキル  ↺ 上で展開済み  ✗ 見つからないファイル${off}"
