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
