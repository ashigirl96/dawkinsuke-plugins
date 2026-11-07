---
name: add-upstream-skill
description: upstream のスキルを除外リストから外して使い始める。依存の閉包を調べ、抜けが出るならどうするかをユーザーに聞く。
disable-model-invocation: true
---

対象は `$ARGUMENTS`。`<name>` か `<submodule>/<name>` の形で来る。

手順 1〜3 は `scripts/try-include.sh`（除外を外した写しで参照を検査する script）だけを使い、checkout を変えない。checkout を変えるのは手順 4 だけ。

## 1. 対象を決める

1. `git submodule status` の行頭に `-` があれば、`git submodule update --init` を流す。
2. `upstream/exclude.txt` から対象の行を探す。`<name>` だけなら `grep -x '[^/]*/<name>' upstream/exclude.txt` で探す。`<name>` が `upstream/rename.txt` の行の右側（新しい名前）なら、その行の左側の `<submodule>/<name>` で探す。
   - 1 行: それが対象。
   - 2 行: 2 つの upstream に同じ名前がある。どちらを入れるかユーザーに聞く。
   - 0 行: `matt/skills/<name>` か `pstack/skills/<name>` があれば、もう入っていると伝えて終わる。無ければ upstream に無い名前なので、そう伝えて終わる。

## 2. 依存の閉包を求める

対象から始めて、除外中のスキルへの依存をたどり尽くす。

1. 外す一覧を対象 1 つで始め、`sh scripts/try-include.sh <一覧>` を流す。
2. 出力の `missing-skill <file>: <name>` の名前ごとに、手順 1 と同じ `grep` で `upstream/exclude.txt` の行を探し、一覧に足す。2 行見つかったら、依存元と同じ submodule の行を選ぶ。
3. 一覧が増えたら 1 に戻る。

一覧が増えなくなったら閉包が求まっている。そのときの `try-include.sh` の出力を **残りの抜け** と呼ぶ。

閉包が対象 1 つだけで、残りの抜けも無ければ、手順 4 に進む。

## 3. ユーザーに聞く

次の 3 つを報告する。

- 対象が直接呼んでいる除外中のスキルの表。列は「依存元の行番号」「呼んでいるスキル」「対象がそれを使う場面」。場面は `rg -n` で該当行を開いて書く。
- 閉包に入ったスキルの数と名前。
- 残りの抜けがあれば、その行と、`rg -n` で開いた参照元の行。

続けて `AskUserQuestion` でどうするかを聞く。選択肢は次のとおり。おすすめを 1 つ選び、理由を添えて先頭に置く。

- **閉包をすべて外す**: 残りの抜けが無いときだけ出す。
- **入れない**: 何も変えずに終わる。
- **fork して参照を消す**: 選ばれたら `/fork-upstream-skill` に進むようユーザーに伝えて終わる。

参照を欠いたまま入れる選択肢は出さない。`.githooks/pre-commit` が流す `scripts/check.sh` は `scripts/check-refs.sh` を含み、抜けが 1 つでもあると commit が通らないため。

## 4. 反映する

1. 閉包の各行を `upstream/exclude.txt` から消す。
2. `sh scripts/sync-skills.sh` を流す。閉包の全スキルが `added <name>` と出る。
3. verify-dawkinsuke スキルで確かめる。対象が読み込まれたスキルの一覧にあり、`sh scripts/check-refs.sh` が exit 0 で終われば完了。

外したスキルの名前と数、確認の結果を報告する。commit はしない。
