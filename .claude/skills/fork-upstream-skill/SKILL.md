---
name: fork-upstream-skill
description: matt か pstack のスキルを fork する、または fork 済みのスキルを変える。変更は必ず ADR.md の決定として残す。
disable-model-invocation: true
---

最初に `docs/fork.md` と `docs/ADR-FORMAT.md` を読む。

## 1. 対象を決める

ユーザーが変えたいスキルを `<name>` とし、`matt/skills/<name>` と `pstack/skills/<name>` のうちあるほうを見る。pstack の文書（`pstack/docs/<name>`）を変えたいときは、そこを見る。見つかった側で、`docs/fork.md` の表から `<置き場>` と `<submodule>` を決める。

- symlink なら fork にする。
	1. `readlink <置き場>/<name>` の `upstream/<submodule>/` より後ろを、upstream のパスとする。
	2. `rm <置き場>/<name> && cp -R upstream/<submodule>/<upstream のパス> <置き場>/<name>` を流す。
	3. `<置き場>/<name>/ADR.md` を、`ADR-FORMAT.md` のテンプレートの frontmatter と `# <name> の fork` の見出しだけで作る。
- `ADR.md` を持つ実ディレクトリなら、すでに fork なので、そのまま次へ進む。
- どちらにも無いなら、上から順に当てはまるものを選ぶ。
	- `skills/<name>` にある: 自作のスキルなので、この手順の対象外。ユーザーにそう伝え、普通に編集する。
	- `grep -x '[^/]*/<name>' upstream/exclude.txt` が当たる: 除外中のスキルを、入れると同時に fork にする。除外したまま使える依存に参照を書き換えるのが、よくある用途。`<name>` が `upstream/rename.txt` の行の右側（新しい名前）なら、その行の左側の名前で探し、upstream のパスもその名前で探す。写す先は新しい名前の `<置き場>/<name>` のままにする。
		1. 当たった行の submodule から、`docs/fork.md` の表で `<置き場>` を決める。2 行当たったら、どちらを fork するかユーザーに聞く。
		2. `scripts/layout.sh` の `sources` で右側が `<置き場>` の行ごとに、左側のディレクトリの下に `<name>` があるかを `ls -d` で探す。見つかったパスから `upstream/<submodule>/` を除いた部分を、upstream のパスとする。
		3. 当たった行を `upstream/exclude.txt` から消し、`cp -R upstream/<submodule>/<upstream のパス> <置き場>/<name>` を流す。
		4. `<置き場>/<name>/ADR.md` を、`ADR-FORMAT.md` のテンプレートの frontmatter と `# <name> の fork` の見出しだけで作る。
	- どれでもない: upstream に無い名前なので、ユーザーにそう伝えて終える。

## 2. 決定を先に書く

変えたいことを、`ADR-FORMAT.md` の「決定 1 つの書き方」に沿って `ADR.md` の末尾に足す。ユーザーが理由を言っていなければ、聞いてから書く。

変更がすでにある決定を広げるだけなら、新しい `##` を足さず、その決定を書き直す。決定を取り消すなら、その `##` を消す。

## 3. ファイルに当てる

`writing-for-agents` スキルを使い、手順 2 の決定を `SKILL.md` などのファイルに当てる。pstack のスキルが adapter を読ませていれば、`docs/fork.md` の「adapter を読ませるスキルの fork」に従う。

- ファイルを足したら、`own` に加える。
- 決定を消した場合は、その決定が生んだ違いを upstream の文面に戻す。

## 4. 確かめる

`docs/fork.md` の「確かめ方」を行い、`sh scripts/check-refs.sh` を流す。`missing-*` が出たら、参照を消す決定を手順 2 に足すか、依存先を `/add-upstream-skill <依存先の submodule>/<name>` で入れるかをユーザーに選んでもらう。除外中から fork したスキルは、この検査で初めて依存の抜けが見える。

adapter（`pstack/docs/harness`）を変えたときは、`docs/fork.md` の「adapter の節が変わったとき」も行う。

完了条件: 「確かめ方」の完了条件を満たし、`sh scripts/check-refs.sh` が exit 0 で終わる。

`ADR.md` に決定が 1 つも残っていなければ、fork をやめ、手順 6 へ進む。symlink から fork にしたものは、`rm -rf <置き場>/<name>` のあと、手順 1 で読んだ `readlink` の値のまま `ln -s` で symlink に戻す。除外中から fork にしたものは `rm -rf <置き場>/<name>` で消し、手順 1 で消した行を `upstream/exclude.txt` に戻す。

## 5. 日本語の差分を作る

`docs/fork.md` の「日本語の差分を作る」を行う。

## 6. 報告する

足した、書き直した、消した決定をユーザーに伝え、`FORK.diff` の場所を示す。commit するかを聞き、commit するときは `git add -A <置き場>/<name> upstream/exclude.txt upstream/rename.txt` で、足したファイルも含める。
