# check-refs.sh と deps.sh が repo のルートで `.` で読み込む、スキルの本文から参照を取り出す処理。

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
	prose "$1" | grep -oE '\]\([^)]+\)' | sed 's/^](//; s/)$//; s/ .*//; s/#.*//' | grep -vE '^$|^[a-z]+:|^/|^<' || true
	# `./` で始まる path は作業ディレクトリを指すので、隣のスキルへの `../` だけを見る。
	prose "$1" | grep -oE '`\.\./[^` ]+`' | tr -d '`' || true
}

skill_refs() {
	prose "$1" | grep -oE '(^|[^A-Za-z0-9_./-])/[a-z0-9][a-z0-9-]*' | sed 's|.*/||' || true
	# ハイフンの無い 1 語の太字は強調（**how**）と区別できないので、後ろに skill があるときだけ数える。
	prose "$1" | grep -oE '(`[a-z0-9-]+`|\*\*[a-z0-9-]+\*\*)( skill)?' | grep -vE '^\*\*[a-z0-9]+\*\*$' | sed 's/[`*]//g; s/ skill$//' || true
}

# principle のスキルは「the **prove-it-works** principle skill」のように principle- を外した名前で呼ばれる。
upstream_name() {
	if echo "$upstream_names" | grep -qx -e "$1"; then echo "$1"
	elif echo "$upstream_names" | grep -qx "principle-$1"; then echo "principle-$1"
	fi
}
