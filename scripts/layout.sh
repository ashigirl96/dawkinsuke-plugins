# repo のルートで `.` で読み込む。

# 各行: upstream でスキルが並ぶディレクトリと、その symlink を張るディレクトリ。
sources="upstream/mattpocock-skills/skills/engineering matt/skills
upstream/mattpocock-skills/skills/productivity matt/skills
upstream/cursor-plugins/harness/pstack/claude-code/skills pstack/skills"
link_dirs="skills matt/skills pstack/skills"
exclude_file=upstream/exclude.txt

# upstream/<submodule>/.../<name> を <submodule>/<name> にする。
key() {
	echo "${1#*upstream/}" | sed 's|/.*/|/|'
}

excluded() {
	sed 's/#.*//; s/[[:space:]]*$//' "$exclude_file" | grep -qx "$1"
}

rename_file=upstream/rename.txt

# 各行: <submodule>/<name> と、その symlink に付ける新しい名前。
renames() {
	sed 's/#.*//' "$rename_file" | awk 'NF == 2'
}

# スキルの識別名は symlink の名前で決まるので、改名したスキルは新しい名前で張る。
link_name() {
	new=$(renames | awk -v k="$1" '$1 == k { print $2 }')
	echo "${new:-${1#*/}}"
}

# 本文は submodule を書かずに upstream の名前で呼ぶので、名前だけで新しい名前を引く。
alias_of() {
	new=$(renames | awk -v n="$1" '{ sub(/.*\//, "", $1) } $1 == n { print $2; exit }')
	echo "${new:-$1}"
}
