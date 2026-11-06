---
name: update-upstream-skill
description: upstream の matt か pstack を新しい版に上げ、思想の変化を評価し、fork したスキルを ADR.md から作り直す。引数は matt か pstack。
argument-hint: matt|pstack
disable-model-invocation: true
---

対象は `$ARGUMENTS`。`matt` か `pstack` のどちらかで、それ以外ならどちらを上げるかユーザーに聞く。1 回に上げるのは 1 つだけ。

最初に `docs/fork.md`、`docs/ADR-FORMAT.md`、対象の版の扱い（`matt` なら [matt.md](matt.md)、`pstack` なら [pstack.md](pstack.md)）を読む。`<置き場>` と `<submodule>` は `docs/fork.md` の表で対象の行を使う。`<旧版>` と `<新版>` は、版の扱いのファイルが決める。`scripts/layout.sh` の `sources` で、upstream の中でスキルが並ぶディレクトリ（`skills/engineering` など）を bucket と呼ぶ。

## 1. 始める前に

1. `git submodule status` の行頭が `-` なら、submodule を取ってきていない。`git submodule update --init` を流す。
2. `git status --porcelain` が空であることを確かめる。空でなければ止めて、ユーザーに commit か `git stash -u` を頼む。「5. fork を 1 つずつ作り直す」は、作り直す前の fork を `HEAD` から読む。

## 2. 版を上げる

版の扱いのファイルの「版を上げる」を行う。pstack では、続けて「写した文書」も行う。旧版はこのあとの手順でも使う。`CLAUDE.md` を書き換えたあとは、`git show HEAD:CLAUDE.md` から読み直せる。

## 3. 置き場を upstream に合わせる

`sh scripts/sync-skills.sh` を流す。この script は、upstream に増えたスキルの symlink を足し、別の bucket に移ったものを張り直す。upstream から消えたものと `upstream/exclude.txt` にあるものは、symlink を消す。出力の 1 行ずつを、「7. 記録して報告する」で使う。

script の出力と fork の状態のうち、次のものは自分で片付ける。

- `added <name>`: 版の扱いのファイルの「増えたスキル」に従う。
- `conflict` の行: 形ごとに対処が違う。
	- `conflict <name> (skills/<name> has the same name)`: upstream に増えたスキルの名前が、自作のスキルと重なっている。どちらを残すかユーザーに選んでもらう。upstream を捨てるなら `upstream/exclude.txt` に `<submodule>/<name>` を足し、自作を捨てるなら `skills/<name>` を消す。
	- `conflict <name> (matt/skills/<name> has the same name)` と `conflict <name> (pstack/skills/<name> has the same name)`: matt と pstack に同じ名前のスキルがあり、括弧の中の、先に張られていた側が残った。どちらを使うかユーザーに選んでもらい、使わない側を `upstream/exclude.txt` に `mattpocock-skills/<name>` か `cursor-plugins/<name>` で足す。
	- `conflict <name> (<dir>/<name> is a directory without ADR.md)`: 括弧の中の `<dir>` に、置き場所を誤った実ディレクトリがある。script は両方の置き場を見るので、`<dir>` は上げていない側のこともある。`git log -1 --format=%H -- <dir>/<name>/ADR.md` が commit を返せば、それが `ADR.md` を消した commit で、ディレクトリは fork だったもの。`git show <commit>^:<dir>/<name>/ADR.md > <dir>/<name>/ADR.md` で戻す。履歴が無ければ自作なので、`skills/<name>` に移す。
- `warning` の行: 除外リストの名前が upstream にない。改名されたなら、除外リストを新しい名前に直す。
- fork の `upstream` のパスが upstream にない: `ls upstream/<submodule>/<upstream のパス>` が失敗するものがそれにあたる。移動先に付け替えるか、`ADR.md` を消して `skills/<name>` に移し、自作にするか、fork ごと消すか、ユーザーに選んでもらう。

除外リストを書き換えたら、もう一度流す。

完了条件: `sh scripts/sync-skills.sh` をもう一度流すと何も出力しない。どの fork でも `upstream` のパスが存在する。

## 4. 思想への影響を評価する

Agent tool で general-purpose の subagent を、`model: "opus"`、`effort: "high"` で新しく立ち上げる。会話を引き継ぐ fork ではなく、まっさらな状態から始めさせる。この session の作業に引きずられず、upstream の変更だけを見させるため。subagent には次の指示だけを渡す。

> `.claude/skills/update-upstream-skill/philosophy-review.md` を読み、その手順に従う。対象は `<matt か pstack>`、submodule は `upstream/<submodule>`、旧版は `<旧版>`、新版は `<新版>`、範囲は `<範囲>`。

範囲は、版の扱いのファイルの「思想の範囲」を渡す。結果が届くまで次へ進まない。

届いた判定をユーザーに示す。「揺らぐ」「覆る」「新しい考え」が 1 つもなければ、そう伝えて次へ進む。あれば、1 つずつ `AskUserQuestion` で、直し案を `docs/philosophy/<対象>.md` に当てるかを聞き、当てると決めたものを書き込む。

完了条件: 「揺らぐ」「覆る」「新しい考え」のすべてに、当てるか当てないかの答えがあり、当てるものが文書に入っている。

## 5. fork を 1 つずつ作り直す

`<置き場>/*/ADR.md` を持つディレクトリごとに、次を順に行う。pstack では `pstack/docs/*/ADR.md` の文書の fork も同じに扱い、adapter（`pstack/docs/harness`）を最初に作り直す。そのあと `docs/fork.md` の「adapter の節が変わったとき」で見つかった fork は、手順 1 の差分が空でも飛ばさず、手順 2 から行う。fork が 1 つもなければ「6. 依存を確かめる」へ進む。

1. **upstream の差分を読む。** 比べるパスは、fork の `upstream`、fork のファイルが名前で呼んでいるスキルの upstream のパス、fork が相対パスで読んでいる upstream の文書（pstack なら `../../docs/` や `../../README.md`）。名前で呼ぶとは、`Call the Skill tool with "grilling"` や「the `code-review` skill」のような書き方のこと。これらを並べて `git -C upstream/<submodule> diff <旧版> <新版> -- <パス...>` を流す。手順 3 でパスが移っていたら、旧と新の両方を渡す。差分が空なら、この fork は飛ばす。
2. **衝突を探す。** `ADR.md` の `##` ごとに、upstream の差分が同じ振る舞いに触れているかを見る。決定が書き換えた箇所を upstream も書き換えた場合と、決定と逆の意図を持ち込んだ場合が衝突にあたる。呼んでいるスキルと読んでいる文書の変更も含める。
3. **衝突を grilling する。** 衝突が 1 つでもあれば `grilling` スキルを使う。1 問に衝突 1 つを載せ、upstream の変更とその意図、自分の決定とその理由を並べて示す。その変更が手順 4 で「揺らぐ」「覆る」「新しい考え」の根拠になっていれば、その判定も添える。答えに応じて `ADR.md` を直す。
	- 自分を優先する: `ADR.md` はそのまま。
	- upstream を優先する: その `##` を `ADR.md` から消す。
	- 両方を取る: その `##` を新しい意図で書き直す。
4. **作り直す。** `rsync -a --delete --exclude ADR.md --exclude FORK.diff --exclude <own のファイル>... upstream/<submodule>/<upstream のパス>/ <置き場>/<name>/` で upstream の中身に戻す。`own` のファイルは 1 つずつ `--exclude` に渡す。そのあと `writing-for-agents` スキルを使い、`ADR.md` の決定を上から順に当てる。前回から変わっていない決定は、前回の fork（`git show HEAD:<置き場>/<name>/<ファイル>`）と同じ文面で当てる。
5. **決定が残っていなければ symlink に戻す。** `ADR.md` に `##` が 1 つもなければ、`rm -rf <置き場>/<name>` を流し、`<置き場>/<name>` から `upstream/<submodule>/<upstream のパス>` への相対パスで `ln -s` を張り、次の fork へ進む。
6. **確かめる。** `docs/fork.md` の「確かめ方」を行う。
7. **日本語の差分を作る。** `docs/fork.md` の「日本語の差分を作る」を行う。

完了条件: 残ったすべての fork が「確かめ方」の完了条件を満たし、それぞれの `FORK.diff` が新版との差分になっている。

## 6. 依存を確かめる

`verify-dawkinsuke` スキルを使う。上がったスキルや作り直した fork が、除外中のスキルや無い文書を呼んでいれば、ここで `missing-*` として出る。抜けごとに、依存先を入れる（`/add-upstream-skill <依存先の submodule>/<name>`）か、依存元のスキルも除外するか、依存元を fork して参照を消す（`/fork-upstream-skill`）かをユーザーに選んでもらう。

完了条件: `sh scripts/check-refs.sh` が exit 0 で終わる。

## 7. 記録して報告する

1. ユーザーに次を報告する。
	- 旧版と新版
	- 版の扱いのファイルが報告に足すもの
	- 手順 4 の一番重い判定と、思想の文書に当てた直し
	- symlink のまま使っているスキルのうち中身が変わったもの。`<置き場>` の symlink ごとに、`readlink` の向き先から upstream のパスを取り、`git -C upstream/<submodule> diff --stat <旧版> <新版> -- <upstream のパス>` を流して拾う。
	- 足した、張り直した、消した symlink と、除外リストに足したスキル
	- fork ごとの衝突と、grilling で決めたこと、`FORK.diff` の場所
	- 手順 6 で見つけた抜けと、その対処
2. commit するかをユーザーに聞く。commit するときは `git add -A matt pstack skills docs/philosophy CLAUDE.md upstream/exclude.txt scripts/layout.sh upstream/<submodule>` で、upstream が足したファイルも含める。
