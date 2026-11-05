# codex subagent に任せると結果が届く

親が Agent tool で `codex-subagent:<モデル>` を起動すると、Claude Code が本物の subagent を起こし、Agent の行が `Backgrounded agent` で出て、状態行の下の subagent の一覧に `◯ codex-subagent:<モデル>  <説明>` が並ぶ。その subagent の手は mod が答え、Anthropic の API を呼ばない。最初の手で codex の tool（`mcp__codex-subagent__codex`）を呼び、`codex app-server` の thread で turn を最後まで走らせる。次の手で codex の最後の答えを `SubagentHandback` で返し、親に `› Message from @codex-subagent-<モデル>` と `Agent "<説明>" finished` が届く。codex のコマンドはネットワークを使える。

## Sub-features

- `launch`: Agent の行が `⎿  Backgrounded agent (↓ to manage · ctrl+o to expand)` で出て、親はすぐ次に進む。走っている間、状態行の下の一覧に `◯ codex-subagent:<モデル>  <説明>` が出る。
- `deliver`: 終わると `› Message from @codex-subagent-<モデル>…` が来て、codex の最後の答えが本文になり、`⏺ Agent "<説明>" finished` が出る。本文の頭に Claude Code が「auto mode の分類器が使えなかった」という注記を付ける（ADR 0003 で受け入れた）。
- `network`: codex が `gh api` を走らせ、GitHub の答えが届く。
- `nested`: codex が自分の subagent（`spawn_agent`）を起動でき、その答えが届く。
- `send-running`: 走っている codex subagent に `SendMessage` を送ると、codex の今の turn が終わったあと、同じ thread の次の turn にその文が渡り、その turn の答えが親に届く。最初の turn の答えは届かない。
- `resume`: 終わった codex subagent に `SendMessage` を送ると、`Resuming agent <id>` が出て、同じ thread の次の turn が走り、答えが親に届く。codex は前の turn を覚えている。
- `stop`: TaskStop で走っている codex subagent を止めると、`Stop Task ⎿ <説明> · stopped` と `Agent "<説明>" was stopped by Claude` が出て、答えは届かない。codex の turn も中断される。
- `cleanup`: `/exit` で、mod が起こした中継（`relay/relay.ts`）と `codex app-server` が止まる。

## How to get to it (user POV)

- 「Agent tool で subagent_type "codex-subagent:gpt-6-luna" を起動して、〜を頼んで」と打つ。種類の名前はモデル ID の `.` を `-` にしたもの。並びは codex の `model/list` で決まるので、`gpt-6-luna` が無ければ一覧の安いモデルに替える。

## Driving it with tui.sh

起動: `$T start codex-$id --setting-sources project --plugin-dir mods/codex-subagent --model sonnet --permission-mode auto --session-id <uuid>`

1 つの session で順に打つ。

- **cleanup の前半.** 起動の直後に `pgrep -fl 'relay/relay.ts|^codex app-server$'` で 2 つ出ることを見る。
- **launch・deliver・network.** ``$T send codex-$id 'Agent tool で subagent_type "codex-subagent:gpt-6-luna" を起動し、`gh api rate_limit --jq .rate.limit` を走らせてその出力だけを返すよう頼んで。結果が届いたら、届いた数字をそのまま書いて。'``。`$T wait codex-$id 'codex-subagent' 60` のあと数秒おいて `$T shot` を撮り、一覧に `◯ codex-subagent:gpt-6-luna` が出ていることを見る。`$T wait codex-$id 'Agent ".*" finished' 240` のあと 10 秒ほどおいて `$T shot codex-$id "$run/codex-subagent-launch.txt"`。写しに `Message from @codex-subagent-gpt-6`、`finished`、`5000` のような数字が並ぶ。数字が出ればネットワークが通っている。
- **nested.** ``$T send codex-$id 'もう 1 つ、subagent_type "codex-subagent:gpt-6-luna" を起動して、「codex 自身の subagent（spawn_agent）を 1 つ起動し、その subagent に `echo nested-ok` を走らせ、subagent の答えをそのまま返して」と頼んで。届いたら本文をそのまま書いて。'``、起動の行に出た説明で `$T wait codex-$id 'Agent "<説明>.*finished' 300` を待つ（1 つ目の `finished` に合わないように）。届いた本文に `nested-ok` が出る。codex が自分で echo しただけでないかは、`find ~/.codex/sessions -name '*.jsonl' -mmin -5` の rollout で確かめる。子の rollout の 1 行目に `"thread_spawn":{"parent_thread_id":"<親の id>"` と `"depth":1` があり、`<親の id>` の rollout に `"name":"spawn_agent"` がある。
- **stop.** ``$T send codex-$id 'もう 1 つ、Agent tool で subagent_type "codex-subagent:gpt-6-luna" を起動し、「`sleep 90` を走らせ、そのあと LATE-D とだけ答えて」と頼んで。起動したら 20 秒待ってから（Bash で sleep 20）、TaskStop でその subagent を止めて。'``、`$T wait codex-$id 'stopped' 180`、`$T shot`。`Stop Task ⎿ … · stopped` と `was stopped by Claude` が出て、`Message from` の答えは来ない。codex の側で止まったかは、`grep -l 'sleep 90'` で見つけた `~/.codex/sessions` の新しい rollout に `"type":"turn_aborted"` と `"reason":"interrupted"` があり、`duration_ms` が 90 秒より短いかで確かめる。
- **send-running.** ``$T send codex-$id 'もう 1 つ、Agent tool で subagent_type "codex-subagent:gpt-6-luna" を起動し、「`sleep 30` を走らせ、そのあと ALPHA とだけ答えて」と頼んで。起動したら 10 秒待ってから、SendMessage でその subagent に「最後の答えに BRAVO も足して」と送って。結果が届いたら本文をそのまま書いて。'``、起動の行に出た説明で `$T wait codex-$id 'Agent "<説明>.*finished' 240`、`$T shot`。届いた本文が `ALPHA BRAVO` になる。SendMessage の結果は `Message queued for delivery to <id> at its next tool round` のままでよい。同じ thread で 2 turn 走ったかは、`grep -rl 'ALPHA BRAVO' ~/.codex/sessions` の rollout の `"last_agent_message"` が `ALPHA`・`ALPHA BRAVO` と並ぶかで確かめる。
- **resume.** 続けて `$T send codex-$id '終わったその subagent に SendMessage で「あなたの前の答えを全部小文字にして、それだけ答えて」と送って。続きの結果が届いたら本文をそのまま書いて。'`、`$T wait codex-$id 'alpha bravo' 180`、`$T shot`。`Resuming agent` のあと `alpha bravo` が届く。同じ rollout の `"last_agent_message"` に `alpha bravo` が 3 つ目として足される。
- **cleanup.** `$T send codex-$id '/exit'` のあと数秒おいて `pgrep -fl 'relay/relay.ts|^codex app-server$'` を流し、何も出ないことを見る。

## Gotchas

- `--permission-mode auto` で起こす。codex の tool は mod の hook が `next(e)` を呼ばずに答えるので、auto mode の判定を通らずに走る。hook が落ちて core に回ると `auto mode's check had no usable answer` で拒まれる。codex のコマンドは codex の sandbox（`workspace-write`）が囲う。
- codex の turn は有料で、1 回 10〜60 秒かかる。安いモデルと短い仕事で確かめる。
- `pgrep` の `codex app-server` は行の全体で合わせる。codex の desktop app が別に起こす `codex app-server --listen unix:// … --managed-daemon` や `daemon pid-update-loop` は mod のものではない。
- `$T turn` の `· done` は、裏の subagent の結果を受けた返答で数えられないことがある。届いたかは `Agent "<説明>" finished` を `$T wait` で待つ。
- `$T wait` に打った文の語を渡すと、入力した行に合ってすぐ抜ける。待つのは mod や Claude Code が出す行の語にする。
- 一覧の 1 行の文は Claude Code が描く（`Running codex-subagent codex tool` など）もので、mod からは変えられない。
- 親が届いた答えに「分類器が使えなかったので確かめていない」と添えるのは、Claude Code の注記によるもので、mod の失敗ではない。
- nested は、mod が thread を `ephemeral: false` で作るから通る。`ephemeral: true` の thread から子を起動すると `no rollout found` で失敗する（`docs/research/codex-app-server.md`）。子の thread の通知も同じ接続に来るが、mod は自分で作った thread の通知しか拾わない。
- 入力欄に薄く出る「結果はまだ？」のような文は候補で、打たれていない。
- send-running の文は、codex の turn が走っている間は mod に見えない。Claude Code は subagent の次の tool の区切り（codex の tool が返ったとき）に渡すので、mod はその文を `session.receive` で受け取って持ち、`SubagentHandback` の前に同じ thread の次の turn で codex に渡す。`turn/steer` で今の turn に足すことはできない。
- Agent tool に `name` の欄は無い。SendMessage の宛先は、起動の行と一覧に出る agentId になる。
