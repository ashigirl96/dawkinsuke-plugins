#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

. scripts/layout.sh

up() {
	echo "$1" | sed 's|[^/]*|..|g'
}

# $1 に置いた symlink の向き先 $2 が、$1 に張るはずの upstream を指しているか。
owns() {
	echo "$sources" | {
		while read -r parent dest; do
			[ "$dest" = "$1" ] || continue
			case "$2" in "$(up "$dest")/$parent/"*) exit 0 ;; esac
		done
		exit 1
	}
}

# 未取得の submodule では向き先がすべて消えて見え、symlink を全部消してしまう。
echo "$sources" | while read -r parent dest; do
	if [ ! -d "$parent" ]; then
		sub=${parent#upstream/}
		echo "upstream/${sub%%/*} is empty; run git submodule update --init" >&2
		exit 1
	fi
done

for d in $link_dirs; do
	for link in "$d"/*; do
		[ -L "$link" ] || continue
		name=$(basename "$link")
		target=$(readlink "$link")
		if excluded "$(key "$target")"; then
			rm "$link"
			echo "removed $name (excluded)"
		elif [ ! -e "$link" ]; then
			rm "$link"
			echo "removed $name (gone upstream)"
		elif ! owns "$d" "$target"; then
			rm "$link"
			echo "removed $link (wrong directory)"
		fi
	done
done

echo "$sources" | while read -r parent dest; do
	for dir in "$parent"/*; do
		[ -d "$dir" ] || continue
		name=$(basename "$dir")
		excluded "$(key "$dir")" && continue
		# 名前空間は 1 つなので、先に張られた方を残し、実行ごとに入れ替わらないようにする。
		clash=
		for other in $link_dirs; do
			[ "$other" = "$dest" ] && continue
			if [ -e "$other/$name" ] || [ -L "$other/$name" ]; then clash=$other/$name; fi
		done
		if [ -n "$clash" ]; then
			echo "conflict $name ($clash has the same name)"
			continue
		fi
		target="$(up "$dest")/$dir"
		link="$dest/$name"
		if [ -L "$link" ]; then
			[ "$(readlink "$link")" = "$target" ] && continue
			ln -sfn "$target" "$link"
			echo "relinked $name"
		elif [ -e "$link" ]; then
			[ -f "$link/ADR.md" ] || echo "conflict $name ($link is a directory without ADR.md)"
		else
			ln -s "$target" "$link"
			echo "added $name"
		fi
	done
done

all_keys=$(echo "$sources" | while read -r parent dest; do
	for dir in "$parent"/*; do
		[ -d "$dir" ] || continue
		key "$dir"
	done
done)
sed 's/#.*//; s/[[:space:]]*$//' "$exclude_file" | grep -v '^$' | while read -r entry; do
	echo "$all_keys" | grep -qx "$entry" || echo "warning $entry in $exclude_file is not an upstream skill"
done
