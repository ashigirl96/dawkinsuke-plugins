#!/bin/sh
# スキルが参照するファイルとスキルを、参照先のスキルもたどって木の形で出す。
# 引数が <submodule>/<name> か upstream のディレクトリなら upstream の中だけを、
# skills/・matt/skills/・pstack/skills/ のディレクトリなら checkout を先に見る（fork の違いが出る）。
set -eu
[ $# -eq 1 ] || { echo "usage: sh scripts/deps.sh <submodule>/<name> | <skill directory>" >&2; exit 2; }
if [ -d "$1" ]; then arg=$(cd "$1" && pwd); else arg=$1; fi
cd "$(dirname "$0")/.."
repo=$(pwd)
arg=${arg#"$repo"/}
. scripts/refs.sh

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
	bold=$(printf '\033[1m') dim=$(printf '\033[2m') red=$(printf '\033[31m') off=$(printf '\033[0m')
else
	bold= dim= red= off=
fi

# 各行: <submodule>/<name> とその upstream のディレクトリ。
index=$(echo "$upstream_dirs" | sed 's|^upstream/\([^/]*\)/.*/\([^/]*\)$|\1/\2 &|')

dir_of() {
	echo "$index" | awk -v k="$1" '$1 == k { print $2 }'
}

# 木の節は upstream のスキルなら <submodule>/<name>、checkout のスキルならそのディレクトリ。
node_dir() {
	if [ -d "$1" ]; then echo "$1"; else dir_of "$1"; fi
}

checkout_dir() {
	for d in skills matt/skills pstack/skills; do
		if [ -e "$d/$1" ]; then echo "$d/$1"; return; fi
	done
}

submodule_of() {
	case $1 in
	matt/*) echo mattpocock-skills ;;
	pstack/*) echo cursor-plugins ;;
	*) echo "${1%%/*}" ;;
	esac
}

location_of() {
	if [ -d "$1" ]; then dirname "$1"; else echo "${1%%/*}"; fi
}

excluded() {
	sed 's/#.*//; s/[[:space:]]*$//' upstream/exclude.txt | grep -qx "$1"
}

# 名前で呼ばれたスキルは、checkout を見るときは checkout から、次に呼んだ側と同じ submodule から探す。
resolve() {
	if [ "$mode" = checkout ]; then
		c=$(checkout_dir "$2")
		if [ -n "$c" ]; then echo "$c"; return; fi
	fi
	name=$(upstream_name "$2")
	[ -n "$name" ] || return 0
	for sub in "$(submodule_of "$1")" mattpocock-skills cursor-plugins; do
		if [ -n "$(dir_of "$sub/$name")" ]; then echo "$sub/$name"; return; fi
	done
}

# ディレクトリ $1 から path $2 への相対 path。
relative() {
	awk -v a="$1" -v b="$2" 'BEGIN {
		n = split(a, x, "/"); m = split(b, y, "/"); i = 1
		while (i <= n && i < m && x[i] == y[i]) i++
		for (j = i; j <= n; j++) s = s "../"
		for (j = i; j < m; j++) s = s y[j] "/"
		print s y[m]
	}'
}

# ADR.md は fork の経緯の記録で、スキルの実行中には読まれない。
docs() {
	find -L "$1" -name '*.md' ! -name ADR.md | sort
}

# 各行: f <スキルからの相対 path>、x <見つからない参照> <参照元>、s <スキルの節>。
children() (
	dir=$(node_dir "$1")
	docs "$dir" | while read -r f; do
		file_refs "$f" | while read -r ref; do
			if p=$(cd "$(dirname "$f")" && cd "$(dirname "$ref")" 2>/dev/null && pwd) && [ -e "$p/$(basename "$ref")" ]; then
				echo "f $(relative "$dir" "${p#"$repo"/}/$(basename "$ref")")"
			else
				echo "x $ref $(relative "$dir" "$f")"
			fi
		done
	done | sort -u
	docs "$dir" | while read -r f; do skill_refs "$f"; done |
		while read -r name; do resolve "$1" "$name"; done | sort -u | grep -vx "$1" | sed 's/^/s /' || true
)

label() {
	out="${1##*/}"
	[ "$(location_of "$1")" = "$root_location" ] || out="$out  ${dim}$(location_of "$1")${off}"
	if excluded "$1"; then out="$out  ${dim}(excluded)${off}"; fi
	echo "$out"
}

walk() (
	kids=$(children "$1")
	[ -n "$kids" ] || exit 0
	last=$(echo "$kids" | wc -l)
	i=0
	echo "$kids" | while read -r kind val from; do
		i=$((i + 1))
		if [ "$i" -eq $last ]; then branch='└─' next="$2   "; else branch='├─' next="$2│  "; fi
		case $kind in
		f) echo "$2$branch $val" ;;
		x) echo "$2$branch ${red}✗ $val${off}  ${dim}missing, from $from${off}" ;;
		s)
			if grep -qx "$val" "$seen"; then
				echo "$2$branch${dim}↺ $(label "$val")${off}"
				continue
			fi
			echo "$val" >> "$seen"
			if excluded "$val"; then sym=◇; else sym=◆; fi
			echo "$2$branch$sym ${bold}$(label "$val")${off}"
			walk "$val" "$next"
			;;
		esac
	done
)

mode=upstream
root=$(echo "$index" | awk -v d="$arg" '$2 == d { print $1 }')
if [ -z "$root" ] && [ -n "$(dir_of "$arg")" ]; then root=$arg; fi
if [ -z "$root" ] && [ -d "$arg" ]; then
	case $arg in skills/* | matt/skills/* | pstack/skills/*) root=$arg mode=checkout ;; esac
fi
[ -n "$root" ] || { echo "error $1 is not a skill in upstream or this checkout" >&2; exit 2; }
root_location=
seen=$(mktemp)
trap 'rm -f "$seen"' EXIT
echo "$root" > "$seen"
echo "${bold}${root##*/}${off}  ${dim}$(location_of "$root")${off}$(if excluded "$root"; then echo "  ${dim}(excluded)${off}"; fi)"
root_location=$(location_of "$root")
walk "$root" ""
[ -z "${off}" ] || echo "${dim}◆ スキル  ◇ 除外中のスキル  ↺ 上で展開済み  ✗ 見つからないファイル${off}"
