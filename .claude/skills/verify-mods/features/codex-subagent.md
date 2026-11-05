# codex subagent に任せると結果が届く

親が Agent tool で `codex-subagent:<モデル>` を起動すると、Agent の行が本物の subagent と同じく `Backgrounded agent` で出て、裏で `codex app-server` の thread が codex 自身の tool で最後まで走る。走っている間、codex が走らせたコマンドと編集したファイルが Agent の行の下に `⎿  Bash(…)`・`⎿  Write(…)` の形で流れる。終わると `› Prompt from the codex-subagent plugin` の新しい turn が来て、本文の頭に `The codex subagent "<説明>" (codex-subagent:<モデル>, agentId codex-…) finished.` とモデルの出力が届く。codex のコマンドはネットワークを使える。

## Sub-features

- `launch`: Agent の行が `⎿  Backgrounded agent (↓ to manage · ctrl+o to expand)` で出て、親はすぐ次に進む。
- `steps`: codex のコマンドが `⎿  Bash(<コマンド>)` と、その下の `exit <終了コード> · <出力の末尾 3 行>`（走っている間は `running…`）で、ファイルの変更が `⎿  Write(<path>)`・`Update(<path>)`・`Delete(<path>)` で出る。新しい 5 つだけを出し、残りは `… +<数> more` にまとめ、ctrl+o で全部出る。
- `deliver`: 終わると `› Prompt from the codex-subagent plugin` の turn が来て、codex の最後の答えが届く。
- `network`: codex が `gh api` を走らせ、GitHub の答えが届く。
- `nested`: codex が自分の subagent（`spawn_agent`）を起動でき、その答えが届く。
- `cleanup`: `/exit` で、mod が起こした中継（`relay/relay.ts`）と `codex app-server` が止まる。

## How to get to it (user POV)

- 「Agent tool で subagent_type "codex-subagent:gpt-6-luna" を起動して、〜を頼んで」と打つ。種類の名前はモデル ID の `.` を `-` にしたもの。並びは codex の `model/list` で決まるので、`gpt-6-luna` が無ければ一覧の安いモデルに替える。

## Driving it with tui.sh

起動: `$T start codex-$id --setting-sources project --plugin-dir mods/codex-subagent --model sonnet --permission-mode auto`

- **launch・deliver・network.** ``$T send codex-$id 'Agent tool で subagent_type "codex-subagent:gpt-6-luna" を起動し、`gh api rate_limit --jq .rate.limit` を走らせてその出力だけを返すよう頼んで。結果が届いたら、届いた数字をそのまま書いて。'``。`$T wait codex-$id 'Backgrounded agent'` で行を見て、`$T turn codex-$id 2 240` で届いた turn の返答まで待ち、`$T shot codex-$id "$run/codex-subagent-launch-after.txt"`。写しに `Prompt from the codex-subagent plugin`、`finished. What follows is its model output`、`5000` のような数字が並ぶ。数字が出ればネットワークが通っている。
- **steps.** 別の session で ``$T send codex-$id 'Agent tool で subagent_type "codex-subagent:gpt-6-luna" を起動し、次を順に 1 つずつ別のコマンドで走らせるよう頼んで: `sleep 5; echo one`、`ls mods`、ファイル /tmp/codex-subagent-note.txt に hi と書く（apply_patch で）、`sleep 20; echo two`。最後に two とだけ返させて。結果が届いたら届いた語だけ書いて。'``。`$T wait codex-$id 'Bash\(ls mods\)'` で出たら、届く前に `$T shot codex-$id "$run/codex-subagent-steps-running.txt"`。写しで `Prompt from the codex-subagent plugin` より前に、Agent の行の下に `⎿  Bash(sleep 5; echo one)` と `exit 0 · one` が並ぶ。`$T turn codex-$id 2 240` のあと、もう 1 枚撮って `⎿  Write(/tmp/codex-subagent-note.txt)` と `exit 0 · two` を見る。終わったら `/tmp/codex-subagent-note.txt` を消す。
- **nested.** 同じ session で ``$T send codex-$id 'もう 1 つ、subagent_type "codex-subagent:gpt-6-luna" を起動して、「codex 自身の subagent（spawn_agent）を 1 つ起動し、その subagent に `echo nested-ok` を走らせ、subagent の答えをそのまま返して」と頼んで。'``、`$T turn codex-$id 4 400`。届いた本文に `nested-ok` が出る。codex が自分で echo しただけでないかは、`find ~/.codex/sessions -name '*.jsonl' -mmin -5` の新しい rollout の 1 行目に `"thread_spawn":{"parent_thread_id":…}` があるかで確かめる。
- **cleanup.** 起動の直後に `pgrep -fl 'relay/relay.ts|^codex app-server$'` で 2 つ出ることを見て、`$T send codex-$id '/exit'` のあとにもう一度流し、何も出ないことを見る。

## Gotchas

- `--permission-mode auto` で起こす。親の Agent の呼び出しだけが auto mode の判定を通り、codex のコマンドは codex の sandbox（`workspace-write`）が囲う。
- codex の turn は有料で、1 回 10〜60 秒かかる。安いモデルと短い仕事で確かめる。
- `pgrep` の `codex app-server` は行の全体で合わせる。codex の desktop app が別に起こす `codex app-server --listen unix:// … --managed-daemon` や `daemon pid-update-loop` は mod のものではない。
- 届いた turn の前に、親が起動を伝える返答で 1 回 `done` が数えられる。`turn` の数はその分を足す。
- steps の行の並びの頭に、codex が自分で読む `~/.claude/CLAUDE.md` などの `Bash(cat …)` が混ざる。codex が repo の指示を読みに行くためで、mod の失敗ではない。
- `/reload-plugins` のあとも行は残る（`$.state` に置いている）。
- 入力欄に薄く出る「結果はまだ？」のような文は候補で、打たれていない。
