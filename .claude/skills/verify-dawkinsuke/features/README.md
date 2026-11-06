# dawkinsuke 検証マップ

dawkinsuke プラグインの「入れたスキルが、必要なものを全部持って読み込まれる」ことを確かめる手順の正本。駆動の前にこの索引を読み、該当する機能のファイルを手順として使う。

## Baseline preconditions

- repo のルートにいて、`../SKILL.md` の Doctor が全部通っている。
- `$run` を作ってある。
- 検証のために `upstream/exclude.txt` や symlink を変えるときは、checkout ではなく一時の写し（`cp -R . "$tmp/r"`）で変える。

## Driving conventions

- 「入っている」の判定は `claude --plugin-dir . plugin details dawkinsuke` の `Skills (N)` の行に従う。
- コマンドは書いてあるとおりに流す。

## Proof and skip reporting

- コマンド、標準出力、exit code を `$run` に残す。
- 抜けを報告するときは、参照している行を行番号つきで添える。
- 流せなかった手順は、流したコマンドと満たせなかった前提を書いて報告する。別の手順で確かめたことにしない。

## Feature entry contract

各ファイルは H1 の題と、ユーザーから見た振る舞いを書いた 1 段落で始まり、`Sub-features`、`How to get to it (user POV)`、`Driving it with claude --plugin-dir`、`Gotchas` の 4 つの H2 をこの順に持つ。

## Features

- [読み込まれるスキル](./loaded-skills.md): Claude Code が checkout から読み込むスキルが、`skills/`・`matt/skills/`・`pstack/skills/` の並びと一致する。
- [スキルが読む文書](./file-refs.md): スキルが相対 path で読む文書や隣のスキルのファイルが、その path にある。
- [スキルが呼ぶスキル](./skill-refs.md): スキルが名前で呼ぶ upstream のスキルが、読み込まれている。
- [スキルを入れる前に依存を調べる](./try-include.md): 除外しているスキルを入れたら何が足りなくなるかを、checkout を変えずに調べる。
- [setup-dawkinsuke と /play](./setup-dawkinsuke.md): 使い捨ての repo で `/setup-dawkinsuke` を 2 回流して生成物と無変化を確かめ、`/play` が「設計→実装」を選んで部品スキルを呼べるかを見る。
