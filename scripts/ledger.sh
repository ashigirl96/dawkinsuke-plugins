#!/bin/sh
# スキル台帳。dawkinsuke が知っているスキルを 1 つ 1 行、タブ区切りで出す。
# 列: 名前 種類(symlink|fork|own|-) 置き場 key upstream 状態(use|excluded|outside|conflict|gone|no-adr) 呼ばれる名前(,区切り)
# 引数に名前か key を渡すと、その行だけを出す。先頭の引数が - なら、作り直さずに標準入力の表から引く。
# --places は、行の有無によらず置き場を 1 行ずつ出す。
# 表はあるべき姿で、置き場の symlink は読まない（docs/adr/0006-skill-ledger-desired-state.md）。
set -eu
cd "$(dirname "$0")/.."

# 各行: upstream でスキルが並ぶディレクトリと、その置き場。上の行ほど名前の衝突で勝つ。
sources="upstream/mattpocock-skills/skills/engineering matt/skills
upstream/mattpocock-skills/skills/productivity matt/skills
upstream/cursor-plugins/harness/pstack/claude-code/skills pstack/skills"
# 取り込み元の外でも、本文が名前で呼びうる upstream のスキル。
known="upstream/mattpocock-skills/skills/*/*/ upstream/cursor-plugins/harness/pstack/claude-code/skills/*/"
places="skills matt/skills pstack/skills"

find_rows() {
	awk -F'\t' -v args="$*" '
		{ row[NR] = $0; name[NR] = $1; key[NR] = $4; names[NR] = "," $7 "," }
		END {
			n = split(args, a, " ")
			for (i = 1; i <= n; i++) {
				hit = 0
				for (r = 1; r <= NR; r++) if (name[r] == a[i] || key[r] == a[i]) { pick[r] = 1; hit = 1 }
				if (!hit) for (r = 1; r <= NR; r++) if (index(names[r], "," a[i] ",")) pick[r] = 1
			}
			for (r = 1; r <= NR; r++) if (pick[r]) print row[r]
		}'
}

if [ "${1:-}" = --places ]; then
	echo "$places" | tr ' ' '\n'
	exit
fi

if [ "${1:-}" = - ]; then
	shift
	find_rows "$@"
	exit
fi

missing=$(echo "$sources" | while read -r parent place; do [ -d "$parent" ] || echo "$parent"; done)
[ -z "$missing" ] || { echo "error upstream is not checked out: $missing" >&2; exit 2; }

submodule_of_place() {
	parent=$(echo "$sources" | awk -v p="$1" '$2 == p { print $1; exit }')
	parent=${parent#upstream/}
	echo "${parent%%/*}"
}

frontmatter_upstream() {
	awk 'NR == 1 && $0 != "---" { exit } NR > 1 && $0 == "---" { exit } NR > 1 && sub(/^upstream:[[:space:]]*/, "") { print; exit }' "$1"
}

facts() {
	echo "$sources" | awk '{ print "s\t" $1 "\t" $2 }'
	for d in $known; do
		[ -d "$d" ] && printf 'u\t%s\n' "${d%/}"
	done
	[ ! -f upstream/exclude.txt ] || sed 's/#.*//' upstream/exclude.txt | awk 'NF == 1 { print "e\t" $1 }'
	[ ! -f upstream/rename.txt ] || sed 's/#.*//' upstream/rename.txt | awk 'NF == 2 { print "r\t" $1 "\t" $2 }'
	for place in $places; do
		for d in "$place"/*; do
			[ -d "$d" ] && [ ! -L "$d" ] || continue
			name=${d##*/}
			if [ "$place" = skills ]; then
				printf 'd\t%s\t%s\town\t-\t-\tuse\n' "$place" "$name"
			elif [ ! -f "$d/ADR.md" ]; then
				printf 'd\t%s\t%s\t-\t-\t-\tno-adr\n' "$place" "$name"
			else
				path=$(frontmatter_upstream "$d/ADR.md")
				sub=$(submodule_of_place "$place")
				if [ -z "$path" ]; then
					printf 'd\t%s\t%s\tfork\t-\t-\tgone\n' "$place" "$name"
				else
					up=upstream/$sub/$path
					state=use
					[ -d "$up" ] || state=gone
					printf 'd\t%s\t%s\tfork\t%s\t%s\t%s\n' "$place" "$name" "$sub/${path##*/}" "$up" "$state"
				fi
			fi
		done
	done
}

table() {
	facts | awk -F'\t' '
		function add(n, k, pl, ky, up, st, rk) {
			rows++; nm[rows] = n; kd[rows] = k; plc[rows] = pl; ks[rows] = ky; ups[rows] = up; stt[rows] = st; rank[rows] = rk
		}
		$1 == "s" { srcs++; parent[srcs] = $2; dest[srcs] = $3; next }
		$1 == "e" { excluded[$2] = 1; next }
		$1 == "r" { renamed[$2] = $3; next }
		$1 == "u" { ups_seen++; udir[ups_seen] = $2; next }
		$1 == "d" {
			# 置き場の実ディレクトリは Claude Code が必ず読むので、名前の衝突では常に勝つ。
			add($3, $4, $2, $5, $6, $7, 0)
			if ($5 != "-") forked[$5] = 1
			next
		}
		END {
			for (i = 1; i <= ups_seen; i++) {
				d = udir[i]; n = split(d, part, "/"); key = part[2] "/" part[n]
				if (key in forked) continue
				dir = d; sub(/\/[^\/]+$/, "", dir)
				src = 0
				for (j = 1; j <= srcs; j++) if (parent[j] == dir) { src = j; break }
				if (!src) { add(part[n], "-", "-", key, d, "outside", -1); continue }
				name = (key in renamed) ? renamed[key] : part[n]
				if (key in excluded) { add(name, "-", dest[src], key, d, "excluded", -1); continue }
				# 改名で名前を取りに行った側は、取り込み元の順によらず、その名前を元から持つ側に負ける。
				add(name, "symlink", dest[src], key, d, "use", (key in renamed) * srcs + src)
			}
			for (r = 1; r <= rows; r++) if (rank[r] >= 0 && (!(nm[r] in best) || rank[r] < rank[best[nm[r]]])) best[nm[r]] = r
			for (r = 1; r <= rows; r++) {
				if (rank[r] >= 0 && best[nm[r]] != r) stt[r] = "conflict"
				names = nm[r]
				orig = ks[r]; sub(/.*\//, "", orig)
				if (ks[r] != "-" && orig != nm[r]) names = names "," orig
				if (nm[r] ~ /^principle-/) names = names "," substr(nm[r], 11)
				print nm[r] "\t" kd[r] "\t" plc[r] "\t" ks[r] "\t" ups[r] "\t" stt[r] "\t" names
			}
		}' | LC_ALL=C sort
}

if [ $# -eq 0 ]; then table; else table | find_rows "$@"; fi
