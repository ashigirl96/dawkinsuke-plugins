---
name: fork-upstream-skill
description: matt か pstack のスキルを fork する、または fork 済みのスキルを変える。変更は必ず ADR.md の決定として残す。
disable-model-invocation: true
---

最初に `docs/fork.md` と `docs/ADR-FORMAT.md` を読む。

## 1. 対象を決める

ユーザーが変えたいスキルを `<name>` とし、`matt/skills/<name>` と `pstack/skills/<name>` のうちあるほうを見る。見つかった側で、`docs/fork.md` の表から `<置き場>` と `<submodule>` を決める。

- symlink なら fork にする。
	1. `readlink <置き場>/<name>` の `../../upstream/<submodule>/` より後ろを、upstream のパスとする。
	2. `rm <置き場>/<name> && cp -R upstream/<submodule>/<upstream のパス> <置き場>/<name>` を流す。
	3. `<置き場>/<name>/ADR.md` を、`ADR-FORMAT.md` のテンプレートの frontmatter と `# <name> の fork` の見出しだけで作る。
- `ADR.md` を持つ実ディレクトリなら、すでに fork なので、そのまま次へ進む。
- どちらにも無いなら、上から順に当てはまるものを選び、ユーザーにそう伝える。
	- `skills/<name>` にある: 自作のスキルなので、この手順の対象外。普通に編集する。
	- `grep -x '[^/]*/<name>' upstream/exclude.txt` が当たる: 除外中なので、当たった行を渡して `/add-upstream-skill <当たった行>` で先に入れるよう伝えて終える。2 行当たったら、両方を示す。
	- どれでもない: upstream に無い名前なので、そう伝えて終える。

## 2. 決定を先に書く

変えたいことを、`ADR-FORMAT.md` の「決定 1 つの書き方」に沿って `ADR.md` の末尾に足す。ユーザーが理由を言っていなければ、聞いてから書く。

変更がすでにある決定を広げるだけなら、新しい `##` を足さず、その決定を書き直す。決定を取り消すなら、その `##` を消す。

## 3. ファイルに当てる

`writing-for-agents` スキルを使い、手順 2 の決定を `SKILL.md` などのファイルに当てる。

- ファイルを足したら、`own` に加える。
- 決定を消した場合は、その決定が生んだ違いを upstream の文面に戻す。

## 4. 確かめる

`docs/fork.md` の「確かめ方」を行う。

`ADR.md` に決定が 1 つも残っていなければ、fork をやめる。`rm -rf <置き場>/<name> && ln -s ../../upstream/<submodule>/<upstream のパス> <置き場>/<name>` で symlink に戻し、手順 6 へ進む。

## 5. 日本語の差分を作る

`docs/fork.md` の「日本語の差分を作る」を行う。

## 6. 報告する

足した、書き直した、消した決定をユーザーに伝え、`FORK.diff` の場所を示す。commit するかを聞き、commit するときは `git add -A <置き場>/<name>` で、足したファイルも含める。
