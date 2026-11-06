# repo のルートで `.` で読み込む。

upstream_dirs=$(for d in upstream/mattpocock-skills/skills/*/*/ upstream/cursor-plugins/harness/pstack/claude-code/skills/*/; do
	[ -d "$d" ] && echo "${d%/}"
done)
[ -n "$upstream_dirs" ] || { echo "error upstream submodules are not checked out" >&2; exit 2; }
upstream_names=$(echo "$upstream_dirs" | sed 's|.*/||' | sort -u)

# fence の中の path は使う側の repo の例なので見ない。
prose() {
	awk '/^[[:space:]]*(```|~~~)/ { fence = !fence; next } !fence' "$1"
}

file_refs() {
	# `<name>` を含む path と `url` は、本文の書式見本なので数えない。
	prose "$1" | grep -oE '\]\([^)]+\)' | sed 's/^](//; s/)$//; s/ .*//; s/#.*//' | grep -vE '^$|^[a-z]+:|^/|<|^url$' || true
	# `./` で始まる path は作業ディレクトリを指すので、隣のスキルへの `../` だけを見る。
	prose "$1" | grep -oE '`\.\./[^` ]+`' | tr -d '`' | grep -v '<' || true
}

skill_refs() {
	# ユーザーに打たせる名前は `/dawkinsuke:<name>` と plugin 名が付く。
	prose "$1" | sed 's|/dawkinsuke:|/|g' | grep -oE '(^|[^A-Za-z0-9_./-])/[a-z0-9][a-z0-9-]*' | sed 's|.*/||' || true
	# ハイフンの無い 1 語の太字は強調（**how**）と区別できないので、後ろに skill があるときだけ数える。
	prose "$1" | grep -oE '(`[a-z0-9-]+`|\*\*[a-z0-9-]+\*\*)( skill)?' | grep -vE '^\*\*[a-z0-9]+\*\*$' | sed 's/[`*]//g; s/ skill$//' || true
}

# principle のスキルは「the **prove-it-works** principle skill」のように principle- を外した名前で呼ばれる。
upstream_name() {
	if echo "$upstream_names" | grep -qx -e "$1"; then echo "$1"
	elif echo "$upstream_names" | grep -qx "principle-$1"; then echo "principle-$1"
	fi
}

# ADR.md は fork の経緯の記録で、スキルの実行中には読まれない。
skill_docs() {
	find -L "$1" -name '*.md' ! -name ADR.md | sort
}

# ファイル $1 からの参照 $2 が指す path。Claude は symlink 側の path を base directory として受け取るので、.. は cd で文字列として畳む。
resolve_ref() {
	ref_dir=$(cd "$(dirname "$1")" && cd "$(dirname "$2")" 2>/dev/null && pwd) && [ -e "$ref_dir/$(basename "$2")" ] && echo "$ref_dir/$(basename "$2")"
}
