---
name: edit-matt-skill
description: matt のスキルを fork する、または fork 済みのスキルを変える。変更は必ず ADR.md の決定として残す。
disable-model-invocation: true
---

最初に `docs/fork.md` と `docs/ADR-FORMAT.md` を読む。

## 1. 対象を決める

ユーザーが変えたいスキル `matt/skills/<name>` を見る。

- symlink なら fork にする。
	1. `readlink matt/skills/<name>` の `../../upstream/mattpocock-skills/` より後ろを、upstream のパスとする。
	2. `rm matt/skills/<name> && cp -R upstream/mattpocock-skills/<upstream のパス> matt/skills/<name>` を流す。
	3. `matt/skills/<name>/ADR.md` を、`ADR-FORMAT.md` のテンプレートの frontmatter と `# <name> の fork` の見出しだけで作る。
- `ADR.md` を持つ実ディレクトリなら、すでに fork なので、そのまま次へ進む。
- `matt/skills/<name>` が無く `skills/<name>` にあるなら、自作のスキルなので、この手順の対象外。ユーザーにそう伝え、普通に編集する。

## 2. 決定を先に書く

変えたいことを、`ADR-FORMAT.md` の「決定 1 つの書き方」に沿って `ADR.md` の末尾に足す。ユーザーが理由を言っていなければ、聞いてから書く。

変更がすでにある決定を広げるだけなら、新しい `##` を足さず、その決定を書き直す。決定を取り消すなら、その `##` を消す。

## 3. ファイルに当てる

`writing-for-agents` スキルを使い、手順 2 の決定を `SKILL.md` などのファイルに当てる。

- ファイルを足したら、`own` に加える。
- 決定を消した場合は、その決定が生んだ違いを upstream の文面に戻す。

## 4. 確かめる

`docs/fork.md` の「確かめ方」を行う。

`ADR.md` に決定が 1 つも残っていなければ、fork をやめる。`rm -rf matt/skills/<name> && ln -s ../../upstream/mattpocock-skills/<upstream のパス> matt/skills/<name>` で symlink に戻し、手順 6 へ進む。

## 5. 日本語の差分を作る

`docs/fork.md` の「日本語の差分を作る」を行う。

## 6. 報告する

足した、書き直した、消した決定をユーザーに伝え、`FORK.diff` の場所を示す。commit するかを聞き、commit するときは `git add -A matt/skills/<name>` で、足したファイルも含める。
