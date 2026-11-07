---
name: verify-dawkinsuke
description: dawkinsuke プラグインを Claude Code に checkout から読ませ、読み込まれたスキルが依存するスキルや文書が抜けていないかを確かめる。upstream/exclude.txt を書き換えて sync-skills.sh を流したあと、submodule を上げたあと、fork を作り直したあと、スキルがファイルや別のスキルを見つけられないときに使う。
---

確かめる対象は、Claude Code が `--plugin-dir .` でこの checkout から読み込んだプラグインそのもの。ファイルの並びではなく、Claude Code が読み込んだスキルの一覧を正とする。

手順は repo のルートで流す。shell は zsh でも動く書き方にしてある。

## Launch

常駐する process はない。`claude --plugin-dir . ...` がコマンドごとに checkout を読み込み、終われば抜ける。

1. `git submodule status` の行頭に `-` があれば、`git submodule update --init` で upstream を取ってくる。upstream が無いまま `sh scripts/sync-skills.sh` を流すと、何も消さずに exit 1 で止まる。
2. 証拠の置き場を作る。

```sh
run=${TMPDIR:-/tmp/}verify-dawkinsuke/$(date +%Y%m%d-%H%M%S)
mkdir -p "$run"
```

終わりの片付けは要らない。

## Doctor

何かおかしいと思ったら、最初にこれを流す。どれも何も書き換えない。

```sh
git submodule status
claude plugin validate .
claude --plugin-dir . plugin details dawkinsuke | sed -n '1,6p'
find -L skills matt pstack -type l 2>/dev/null
```

駆動してよい状態は次のとおり。

- `git submodule status` の行頭が空白。`-` は未取得、`+` は親 repo が記録したのと違う commit。
- `claude plugin validate .` の最後が `✔ Validation passed`。`with warnings` でもよい。
- `Source: dawkinsuke@inline` と出る。別の Source なら、checkout ではなく入れてある版を読んでいる。
- `find` が何も出さない。`skills/` は自作のスキルが無ければ存在しないので、その旨のエラーは捨てる。`-L` で symlink を追うので、`-type l` に残るのは向き先の無い symlink だけ。`-exec` は sandbox で通らないことがあるので使わない。

## Drive

道具は 3 つ。どれも `claude --plugin-dir . plugin details dawkinsuke` が出すスキル一覧を対象にする。

- `sh scripts/check-refs.sh`: 読み込まれたスキルの `*.md`（`ADR.md` を除く）から参照を拾い、抜けを 1 行ずつ出す。抜けが無ければ何も出さず exit 0、あれば exit 1、checkout を読めなければ exit 2。
  - `missing-file <file>: <path>`: 相対 path の向き先が無い。
  - `missing-skill <file>: <name>`: upstream にあるが読み込まれていないスキルを名前で呼んでいる。
- `sh scripts/try-include.sh <submodule>/<name>...`: 引数のスキルを `upstream/exclude.txt` から外した写しを一時ディレクトリに作り、そこで `check-refs.sh` を流す。checkout は変えない。標準エラーに sync の結果（`added <name>`）、標準出力に抜けが出る。exit code は `check-refs.sh` と同じで、引数が除外リストに無ければ exit 2。スキルを入れるかどうか決める前に使う。
- `sh scripts/check-refs.test.sh`: repo を一時ディレクトリに写し、依存をわざと抜いて `check-refs.sh` が検出するかを確かめる。`ok` で終われば通過。`check-refs.sh` か `try-include.sh` を直したら流す。

機能ごとの手順は [features/README.md](features/README.md) にある。

## Evidence

- 証拠は Launch で作った `$run` に置く。`check-refs.sh` の出力と exit code、`plugin details` の出力を必ず残す。
- 判定は Claude Code が読み込んだ一覧に対して行う。`ls skills` の結果だけで「入っている」と言わない。
- `missing-*` が出たら、そのファイルの該当箇所を `rg -n` で開き、行番号つきで `$run` に写す。報告には「どのスキルが、何を、なぜ必要としているか」を書く。
- 抜けを消すために `check-refs.sh` の検出を緩めない。対処は、依存先を `upstream/exclude.txt` から外すか、依存元も除外するか、fork して参照を消すかのどれか。どれにするかはユーザーが決める。

## Cleanup

`claude` の各コマンドは自分で抜ける。`check-refs.test.sh` は一時ディレクトリを `trap` で消す。手で一時の写しを作ったときは、その写しだけを `rm -rf` する。`$run` は消さない。
