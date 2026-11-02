---
name: update-matt-skill
description: upstream の mattpocock/skills を最新タグに上げ、fork したスキルを ADR.md から作り直す。
disable-model-invocation: true
---

最初に `docs/fork.md` と `docs/ADR-FORMAT.md` を読む。

## 1. 始める前に

1. `git submodule status` の行頭が `-` なら、submodule を取ってきていない。`git submodule update --init` を流す。
2. `git status --porcelain` が空であることを確かめる。空でなければ止めて、ユーザーに commit か `git stash -u` を頼む。手順 4 は、作り直す前の fork を `HEAD` から読む。

## 2. タグを上げる

1. `CLAUDE.md` の「使っているタグ」を読み、旧タグとする。
2. `git -C upstream/mattpocock-skills fetch --tags` を流す。
3. `git -C upstream/mattpocock-skills tag --sort=-v:refname | head -1` で新タグを決める。
4. 新タグが旧タグと同じなら、そう報告して終える。
5. `git -C upstream/mattpocock-skills checkout <新タグ>` を流す。
6. `CLAUDE.md` の「使っているタグ」を新タグに書き換える。旧タグは手順 4 で使うので覚えておく。

完了条件: `git -C upstream/mattpocock-skills describe --tags` が新タグを返し、`CLAUDE.md` のタグも新タグになっている。

## 3. skills/ を upstream に合わせる

`sh scripts/sync-skills.sh` を流す。この script は、upstream に増えたスキルの symlink を足し、別の bucket に移ったものを張り直す。upstream から消えたものと `upstream/exclude.txt` にあるものは、symlink を消す。出力の 1 行ずつを、手順 5 の報告に使う。

script が扱わない次の 3 つは、自分で片付ける。

- `conflict` の行: upstream に増えたスキルの名前が、自作のスキルと重なっている。どちらを残すかユーザーに選んでもらう。
- `warning` の行: 除外リストの名前が upstream にない。改名されたなら、除外リストを新しい名前に直してもう一度流す。
- fork の `upstream` のパスが upstream にない: `ls upstream/mattpocock-skills/<upstream のパス>` が失敗するものがそれにあたる。移動先に付け替えるか、`ADR.md` を消して自作にするか、fork ごと消すか、ユーザーに選んでもらう。

完了条件: `sh scripts/sync-skills.sh` をもう一度流すと何も出力しない。どの fork でも `upstream` のパスが存在する。

## 4. fork を 1 つずつ作り直す

`skills/*/ADR.md` を持つディレクトリごとに、次を順に行う。

1. **upstream の差分を読む。** 比べるパスは、fork の `upstream` と、fork のファイルが名前で呼んでいるスキルの upstream のパス。名前で呼ぶとは、`Call the Skill tool with "grilling"` や「the `code-review` skill」のような書き方のこと。これらを並べて `git -C upstream/mattpocock-skills diff <旧タグ> <新タグ> -- <パス...>` を流す。手順 3 でパスが移っていたら、旧と新の両方を渡す。差分が空なら、この fork は飛ばす。
2. **衝突を探す。** `ADR.md` の `##` ごとに、upstream の差分が同じ振る舞いに触れているかを見る。決定が書き換えた箇所を upstream も書き換えた場合と、決定と逆の意図を持ち込んだ場合が衝突にあたる。呼んでいるスキルの変更も含める。
3. **衝突を grilling する。** 衝突が 1 つでもあれば `grilling` スキルを使う。1 問に衝突 1 つを載せ、matt の変更とその意図、自分の決定とその理由を並べて示す。答えに応じて `ADR.md` を直す。
	- 自分を優先する: `ADR.md` はそのまま。
	- matt を優先する: その `##` を `ADR.md` から消す。
	- 両方を取る: その `##` を新しい意図で書き直す。
4. **作り直す。** `rsync -a --delete --exclude ADR.md --exclude FORK.diff --exclude <own のファイル>... upstream/mattpocock-skills/<upstream のパス>/ skills/<name>/` で upstream の中身に戻す。`own` のファイルは 1 つずつ `--exclude` に渡す。そのあと `writing-for-agents` スキルを使い、`ADR.md` の決定を上から順に当てる。前回から変わっていない決定は、前回の fork（`git show HEAD:skills/<name>/<ファイル>`）と同じ文面で当てる。
5. **決定が残っていなければ symlink に戻す。** `ADR.md` に `##` が 1 つもなければ、`rm -rf skills/<name> && ln -s ../upstream/mattpocock-skills/<upstream のパス> skills/<name>` を流し、次の fork へ進む。
6. **確かめる。** `docs/fork.md` の「確かめ方」を行う。
7. **日本語の差分を作る。** `docs/fork.md` の「日本語の差分を作る」を行う。

完了条件: 残ったすべての fork が「確かめ方」の完了条件を満たし、それぞれの `FORK.diff` が新タグとの差分になっている。

## 5. 記録して報告する

1. ユーザーに次を報告する。
	- 旧タグと新タグ
	- 足した、張り直した、消した symlink
	- fork ごとの衝突と、grilling で決めたこと、`FORK.diff` の場所
2. commit するかをユーザーに聞く。commit するときは `git add -A skills CLAUDE.md upstream/mattpocock-skills` で、upstream が足したファイルも含める。
