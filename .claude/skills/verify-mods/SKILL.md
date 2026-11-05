---
name: verify-mods
description: mods/ の mod（glossary・mermaid-render・skill-chain・codex-subagent）を本物の Claude Code の画面に checkout から読ませ、tmux で打って振る舞いを確かめる。mod の hooks を直したあと、Claude Code を上げたあと、mod が効いていないように見えるとき、`claude plugin test` は通るのに実機で崩れるかを見たいときに使う。
---

確かめる対象は、`claude --setting-sources project --plugin-dir mods/<name>` で checkout から読み込んだ mod が、Claude Code の端末の画面と会話の記録に出す結果。`claude plugin test` の単体テストは engine の代わりの `$` で流すので、組織の管理 plugin や描画の幅による崩れは、ここでしか見えない。

`--setting-sources project` は利用者の設定で入れた plugin（入れてある版の mod を含む）を外し、組織の管理 plugin は残す。`--bare` と `--safe-mode` は `--plugin-dir` も外すので使わない。

手順は repo のルートで流す。Bash の呼び出しをまたいで shell の変数は残らないので、最初に決めた `run` と `id` の値は、以降のコマンドに文字どおり書き込む。

## Launch

1. 依存と証拠の置き場を用意する。mermaid-render は `bun` でルートの `node_modules/beautiful-mermaid` を使う。

```sh
[ -d node_modules/beautiful-mermaid ] || bun install
id=$(date +%Y%m%d-%H%M%S)
run=${TMPDIR:-/tmp/}verify-mods/$id
mkdir -p "$run"
echo "$run $id"
```

2. 確かめる mod ごとに、Claude Code を tmux の中で起こす。`tui.sh`（このスキルの隣にある補助 script）が `vmods-<名前>` の tmux session を幅 200・高さ 50 で作り、入力欄の `❯` が出るまで待つ。

```sh
T=.claude/skills/verify-mods/tui.sh
$T start mermaid-$id --setting-sources project --plugin-dir mods/mermaid-render --model sonnet
```

- 名前には `$id` を入れる。同じ名前の session があれば `start` は止まる。並行する別の agent の session に打ち込まないため。
- `--model sonnet` で費用を抑える。skill-chain の経路だけは `--model opus` にする。opus は一覧に無い名前を Skill tool で呼ぶのを控えるので、mod が model に呼ばせているかを opus でしか見分けられない（haiku は控えずに呼ぶ）。
- 会話の記録を証拠にするときは `--session-id "$(uuidgen | tr A-Z a-z)"` も渡し、その値を控える。記録は `~/.claude/projects/$(pwd | tr '/.' '--')/<session-id>.jsonl` に書かれる。
- 起動に 60 秒かかると `timeout: /^❯/` で exit 1。そのときは `$T shot <名前> /dev/stdout` で画面を見る（信頼の確認やログインの画面で止まっていることが多い）。

`tui.sh` の使い方:

```sh
$T start <名前> <claude の引数...>   # 起こして ❯ を待つ
$T send <名前> '<1 行の文>'          # 文字どおり打ち、Enter を押す
$T key <名前> Escape                 # tmux の key 名で 1 つ押す
$T wait <名前> '<ERE>' [秒]          # 画面（scrollback 込み）に出るまで待つ。既定 120 秒、切れたら exit 1
$T turn <名前> <n> [秒]              # model の返答が n 回終わるまで待つ。既定 180 秒
$T shot <名前> <file>                # 画面を scrollback 込みで file に書く
$T stop <名前>                       # その session を消す
```

- `send` には改行を入れない。入力欄が改行で送信し、残りが崩れる。
- 返答の終わりは `turn` で待つ。返答のあとに「Teach auto mode about your environment?」のような番号付きの確認が出て入力欄を奪い、入力欄には打っていない候補文も薄く出るので、入力欄の見た目では待てない。`send` はその確認が出ていれば Escape で閉じてから打つ。
- `turn` は返答ごとに 1 行出る `· done 1:01 AM` を数える。スラッシュコマンドの多く（`/mermaid off` など）は model を呼ばないので数に入らない。

## Doctor

何かおかしいと思ったら、最初にこれを流す。どれも何も書き換えない。

```sh
for m in glossary mermaid-render skill-chain codex-subagent; do
  claude plugin validate mods/$m | tail -1
  claude --setting-sources project --plugin-dir mods/$m plugin details $m | sed -n 3p
done
tmux ls 2>/dev/null | grep '^vmods-'
ls node_modules/beautiful-mermaid/package.json
```

駆動してよい状態は次のとおり。

- `validate` の最後が `✔ Validation passed`（`with warnings` でもよい）。
- `Source: <name>@inline` と出る。別の Source なら、checkout ではなく入れてある版を読んでいる。`plugin details` の `Hooks (0)` は hooks module を数えないので気にしない。
- `grep '^vmods-'` が出す session は、この run で自分が起こしたものだけ。他は並行する別の agent のものなので触らない。
- `ls` が通る。通らなければ mermaid-render は図を描けず、失敗の 1 行を出す。

単体テストは別に `claude plugin test mods/<name>` で流せる。実機の駆動の代わりにはならない。

## Drive

機能ごとの手順は [features/README.md](features/README.md) にある。共通の形は次のとおり。

1. `$T start` で起こす。
2. `$T send` で、ユーザーが打つのと同じ文やスラッシュコマンドを打つ。
3. `$T wait` で、mod が出すはずの印（罫線の箱、pane の `┃`、禁止の文言）を待つ。model の返答を待つときは、続けて `$T turn <名前> <その session での返答の回数>` で返答の終わりも待つ。
4. `$T shot` で画面を `$run` に書く。

mod の印の例:

- mermaid-render: `┌` `▼` などの罫線。描けなければ `mermaid-render: <理由>` の 1 行。
- glossary: 右の pane の `┃ <用語>`。pane の枠の外に出る `✕` は pane を閉じる印。
- codex-subagent: Agent の行の `Backgrounded agent`、走っている間にその上に流れる `⎿  Bash(…)`・`⎿  Write(…)`、そのあとに来る `› Prompt from the codex-subagent plugin` の turn。
- skill-chain: 画面ではなく会話の記録。期待したスキルの Skill tool の呼び出しと、`cannot be used with Skill tool due to disable-model-invocation` の有無。

## Evidence

- 証拠は Launch で作った `$run` に置く。経路ごとに `$T shot` の画面と、使ったなら会話の記録の写し（`cp ~/.claude/projects/.../<session-id>.jsonl "$run/"`）を残す。
- 打った文と、その結果の画面を両方残す。`send` の前後で 1 枚ずつ `shot` を取る。
- 本物の経路で確かめる。`claude plugin test` の通過や、mod の関数を直に呼んだ結果で「動く」と言わない。
- 副作用も見る。glossary は `$.state`（用語の一覧）に残すので、同じ session で 2 つ目の用語を引くと、1 つ目が pane の下に番号付きで並ぶ。skill-chain は、断られなかったことを画面ではなく記録の `tool_result` で見る。
- model の返答の揺れと mod の失敗を分ける。合否は mod が出す印で決め、model が手順に従ったかでは決めない（各機能の Gotchas を見る）。skill-chain は model に Skill tool を呼ばせるところまでが mod の仕事なので、呼んだかどうかも印に入れる。

## Cleanup

自分が起こした session だけを名前で消す。プロセス名で kill しない。

```sh
for s in $(tmux ls -F '#S' 2>/dev/null | grep -- "-$id\$"); do tmux kill-session -t "$s"; done
```

- GLOSSARY.md を仮に置いたときは、1 行目が `<!-- verify-mods scaffolding -->` のときだけ消す（[features/glossary-command.md](features/glossary-command.md)）。
- `$run` は消さない。証拠はそこに残る。
- 会話の記録（`~/.claude/projects/...` の jsonl）は Claude Code の持ち物なので消さない。
