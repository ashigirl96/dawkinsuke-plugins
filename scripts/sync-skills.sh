#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

src=upstream/mattpocock-skills/skills
exclude_file=upstream/exclude.txt

excluded() {
	sed 's/#.*//; s/[[:space:]]*$//' "$exclude_file" | grep -qx "$1"
}

for link in skills/*; do
	[ -L "$link" ] || continue
	name=$(basename "$link")
	if excluded "$name"; then
		rm "$link"
		echo "removed $name (excluded)"
	elif [ ! -e "$link" ]; then
		rm "$link"
		echo "removed $name (gone upstream)"
	fi
done

for dir in "$src"/engineering/* "$src"/productivity/*; do
	[ -d "$dir" ] || continue
	name=$(basename "$dir")
	excluded "$name" && continue
	target="../$dir"
	link="skills/$name"
	if [ -L "$link" ]; then
		[ "$(readlink "$link")" = "$target" ] && continue
		ln -sfn "$target" "$link"
		echo "relinked $name"
	elif [ -e "$link" ]; then
		[ -f "$link/ADR.md" ] || echo "conflict $name (own skill has the same name as an upstream skill)"
	else
		ln -s "$target" "$link"
		echo "added $name"
	fi
done

sed 's/#.*//; s/[[:space:]]*$//' "$exclude_file" | grep -v '^$' | while read -r name; do
	[ -d "$src/engineering/$name" ] || [ -d "$src/productivity/$name" ] || echo "warning $name in $exclude_file is not an upstream skill"
done
