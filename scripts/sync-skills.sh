#!/bin/sh
# 置き場の symlink をスキル台帳に合わせる。
set -eu
cd "$(dirname "$0")/.."

ledger=$(sh scripts/ledger.sh)
places=$(echo "$ledger" | awk -F'\t' '$3 != "-" { print $3 }' | sort -u)

up() {
	echo "$1" | sed 's|[^/]*|..|g'
}

# 置き場の symlink $1 が張られているべき先。張られるべきでなければ空。
wanted() {
	echo "$ledger" | awk -F'\t' -v l="$1" '$2 == "symlink" && $6 == "use" && $3 "/" $1 == l { print $5 }'
}

for place in $places; do
	for link in "$place"/*; do
		[ -L "$link" ] || continue
		target=$(readlink "$link")
		want=$(wanted "$link")
		if [ -n "$want" ]; then
			[ "$target" = "$(up "$place")/$want" ] && continue
			ln -sfn "$(up "$place")/$want" "$link"
			echo "relinked ${link##*/}"
			continue
		fi
		key=$(echo "$target" | sed 's|^\(\.\./\)*upstream/||; s|/.*/|/|')
		if echo "$ledger" | awk -F'\t' -v k="$key" '$4 == k && $6 == "excluded"' | grep -q .; then
			reason="${link##*/} (excluded)"
		elif [ ! -e "$link" ]; then
			reason="${link##*/} (gone upstream)"
		else
			reason="$link (not in the ledger)"
		fi
		rm "$link"
		echo "removed $reason"
	done
done

echo "$ledger" | awk -F'\t' '$2 == "symlink" && $6 == "use" { print $3 "\t" $1 "\t" $5 }' | while IFS='	' read -r place name upstream; do
	[ -L "$place/$name" ] && continue
	ln -s "$(up "$place")/$upstream" "$place/$name"
	echo "added $name"
done

echo "$ledger" | awk -F'\t' '
	$6 == "use" || $6 == "no-adr" || $6 == "gone" { holder[$1] = $3 "/" $1 }
	$6 == "conflict" { lost[++n] = $1 }
	$6 == "no-adr" { print "conflict " $1 " (" $3 "/" $1 " is a directory without ADR.md)" }
	END { for (i = 1; i <= n; i++) print "conflict " lost[i] " (" holder[lost[i]] " has the same name)" }'

keys=$(echo "$ledger" | awk -F'\t' '$6 != "outside" { print $4 }')
for list in upstream/exclude.txt upstream/rename.txt; do
	sed 's/#.*//' "$list" | awk 'NF { print $1 }' | while read -r entry; do
		echo "$keys" | grep -qx "$entry" || echo "warning $entry in $list is not an upstream skill"
	done
done
