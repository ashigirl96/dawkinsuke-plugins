# fork の仕組み

`/edit-matt-skill` と `/update-matt-skill` の両方がこのファイルを前提にする。

## ADR.md が元データ

fork は、`ADR.md` を持つ `matt/skills/<name>` の実ディレクトリ。matt のスキルとの違いは、すべて `ADR.md` の決定として書く。fork の中身は「最新の upstream に `ADR.md` の決定を当てたもの」で、`/update-matt-skill` が毎回作り直す。`ADR.md` に書いていない違いは、作り直したときに消える。

`ADR.md` は [`ADR-FORMAT.md`](ADR-FORMAT.md) の形式で書く。

fork のディレクトリには、upstream にない管理用のファイルが 2 つある。どちらも upstream との比較と `rsync` の対象から外す。

- `ADR.md`: 決定の一覧。
- `FORK.diff`: upstream から fork への差分を日本語に訳したもの。fork の中の全ファイルを 1 つにまとめる。「日本語の差分を作る」で毎回作り直す。

## fork の中身を書く

`SKILL.md` などのファイルに決定を当てるときは、`writing-for-agents` スキルを使う。

## 確かめ方

fork を変えたあとと作り直したあとには、毎回 upstream と直接比べる。

```sh
diff -ru -x ADR.md -x FORK.diff upstream/mattpocock-skills/<upstream> matt/skills/<name>
```

出てきた違いは、どれも `ADR.md` のどれかの決定で説明できなければならない。種類ごとの扱いは次のとおり。

- 中身の違いは、どの決定がそれを生んだかを言えること。
- `Only in matt/skills/<name>` のファイルは、`own` に挙がっていて、足した理由がどれかの決定に書いてあること。
- `Only in upstream/...` のファイルは、消した理由がどれかの決定に書いてあること。

説明のつかない違いが見つかった場合、その違いが要るなら決定を `ADR.md` に書き足す。要らないなら upstream の文面に戻す。

完了条件: 説明のつかない違いが 1 つもない。

## 日本語の差分を作る

「確かめ方」を通ったあとに、upstream から fork への差分を日本語に訳し、`matt/skills/<name>/FORK.diff` に書く。変えたファイル、足したファイル、消したファイルがすべて 1 つの差分に並ぶ。GitHub で開くと、ファイルごとに区切られ、消した行が赤、足した行が緑で表示される。

upstream との違いがなければ、`rm -f matt/skills/<name>/FORK.diff` を流して終える。違いがあれば、Agent tool で general-purpose の subagent を新しく立ち上げる。会話を引き継ぐ fork ではなく、まっさらな状態から始めさせる。前回の訳に引きずられないようにするためで、subagent には次の指示だけを渡す。

> 1. repo のルートで次を流し、英語の差分を得る。`sed` は、見出し行の時刻を落として、作り直すたびに時刻だけの差分が出ないようにする。
> 	```sh
> 	diff -ruN -x ADR.md -x FORK.diff upstream/mattpocock-skills/<upstream> matt/skills/<name> | sed -E 's/^((---|\+\+\+) [^[:space:]]+)[[:space:]].*/\1/'
> 	```
> 2. 差分を 1 行ずつ日本語に訳す。
> 	- 行頭の ` `、`-`、`+` と、`diff`、`---`、`+++`、`@@` で始まる行はそのまま残す。
> 	- 英語 1 行を日本語 1 行に訳し、行を足したり、まとめたりしない。
> 	- コード、コマンド、ファイル名、スキル名、frontmatter のキーは訳さない。
> 	- 中身のない前後の行も、行頭の空白 1 つを残す。Write tool はこの空白を落とすことがあるので、書いたあとに数を確かめ、落ちていたら戻す。
> 3. `matt/skills/<name>/FORK.diff` は読まない。`rm -f matt/skills/<name>/FORK.diff` で消してから、訳を新しく書き込む。
>
> 完了条件: 行頭が ` `、`-`、`+` の行の数が、それぞれ英語の差分と同じ。

subagent が終わったら、この完了条件を自分でも数えて確かめる。
