# setup-dawkinsuke と /play

ユーザーが新しい repo で `/setup-dawkinsuke` を流すと、`CLAUDE.local.md`、repo-local の `<repo>.md` と `<repo>-models.md`、`.claude/skills/play/`（振り分け役・プレイブック 2 本・原則集）がそろう。2 回流しても何も変わらない。続けて `/play 〇〇したい` と打つと「設計→実装」が選ばれ、最初の部品スキルの呼び出しが skill-chain を通る。

## Sub-features

- `setup-scripts`: `repo-local.sh` が origin の URL から `<host>/<owner>/<repo>` を出し、`check-sheet.sh` がモデル表の抜けと誤りを見つける。
- `setup-files`: 1 回目で生成物がそろう。
- `setup-idempotent`: 2 回目で生成物が 1 バイトも変わらない（モデル表は書き直してよいが、同じ答えなら同じ中身になる）。
- `play-design`: `/play 〇〇したい` が最初の 1 行で「設計→実装」を言い、`grilling` に続けて手動専用の `in-your-own-words` を Skill tool で呼べる。

## How to get to it (user POV)

- dawkinsuke と skill-chain を入れた Claude Code で、repo のルートから `/setup-dawkinsuke` を打つ。
- 続けて `/play <やりたいこと>` を打つ。

## Driving it with claude --plugin-dir

Preconditions:

- Doctor が通っている。`$run` を作ってある。
- repo-local の置き場所を本物の `~/.claude` から外すため、`HOME` を差し替えて流す。`claude` のログイン情報は Keychain にあるので、`HOME` を変えても使える。使えなければ、流せなかった手順として報告する。

- **script.** `sh skills/setup-dawkinsuke/scripts/repo-local.test.sh` と `sh skills/setup-dawkinsuke/scripts/check-sheet.test.sh` を流す。どちらも `ok` で終わる。
- **使い捨ての repo を作る.**

  ```sh
  dawk=$(pwd)
  play=$(mktemp -d)
  mkdir -p "$play/home" "$play/repo"
  git -C "$play/repo" init -q
  git -C "$play/repo" remote add origin git@example.com:fake-owner/fake-repo.git
  mkdir -p "$play/repo/docs/agents"
  printf '## Agent skills\n' > "$play/repo/CLAUDE.md"
  git -C "$play/repo" add -A
  git -C "$play/repo" commit -q -m init
  ```

  matt の設定は済ませた形にしておく。`setup-matt-pocock-skills` は GitHub の issue tracker に届く repo を求めるので、偽の origin では止まり、本物の repo につなぐとラベルを作ってしまう。ここでは段 2 が飛ばされることを見る。

- **1 回目.** 聞かれる問いには、既定どおりに答えるよう prompt で言っておく。

  ```sh
  cd "$play/repo"
  HOME=$play/home claude -p --model opus --setting-sources project \
    --plugin-dir "$dawk" --plugin-dir "$dawk/mods/skill-chain" \
    --permission-mode bypassPermissions --output-format stream-json --verbose \
    '/setup-dawkinsuke 質問にはすべて推奨の答えか既定を選んだものとして進める。モデル表は既定のまま書く。' > "$run/setup1.jsonl"
  cd "$dawk"
  ```

  次がそろっている。

  - `$play/repo/CLAUDE.local.md` が `@~/.claude/repo-local/example.com/fake-owner/fake-repo.md` の 1 行。
  - `$play/home/.claude/repo-local/example.com/fake-owner/fake-repo.md` に `@~/.claude/repo-local/example.com/fake-owner/fake-repo-models.md` の行がある。
  - `sh skills/setup-dawkinsuke/scripts/check-sheet.sh $play/home/.claude/repo-local/example.com/fake-owner/fake-repo-models.md` が `sheet ok`。
  - `diff -r templates/play "$play/repo/.claude/skills/play"` が `Only in ...: principles.md` だけを出し、`cmp pstack/docs/harness/principles.md "$play/repo/.claude/skills/play/principles.md"` が通る。
  - `$play/repo/CLAUDE.md` が `## Agent skills` の 1 行のまま（段 2 を飛ばした）。

- **2 回目.** 生成物の写しを取ってから同じコマンドを `setup2.jsonl` に流し、比べる。

  ```sh
  cp -R "$play/repo" "$play/repo1"; cp -R "$play/home" "$play/home1"
  # 1 回目と同じ claude -p を、出力先だけ "$run/setup2.jsonl" にして流す
  diff -r -x .git "$play/repo1" "$play/repo" > "$run/repo2.diff"
  diff -r "$play/home1" "$play/home" > "$run/home2.diff"
  ```

  `repo2.diff` が空。`home2.diff` は空か、`.claude/repo-local/` の外（Claude Code 自身の session の記録など）だけ。

- **/play.** skill-chain の実機の script で、`grilling` と `in-your-own-words` が呼ばれて通るかを見る。

  ```sh
  sh mods/skill-chain/fixture/live.sh -n 1 -C "$play/repo" -p . -o "$run/play" \
    grilling,in-your-own-words '/play 設定ファイルを YAML から TOML に移したい'
  ```

  `run 1: GREEN` が出る。`$run/play/run1.jsonl` の最初の assistant の text が「プレイブック: 設計→実装」で始まる。

## Gotchas

- `--setting-sources project` を付けないと、利用者の設定で入れた dawkinsuke と skill-chain も読み込まれ、checkout を確かめたことにならない。
- `live.sh` は Write・Edit・Bash を外して流すので、`/play` は聞き取りの最初で止まる。見るのは Skill tool の呼び出しまで。
- 終わったら `rm -rf "$play"` で使い捨ての repo と `HOME` を消す。`$run` は消さない。
