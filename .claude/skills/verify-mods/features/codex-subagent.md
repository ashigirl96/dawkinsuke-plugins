# codex subagent に任せると結果が届く

親が Agent tool で `codex-subagent:<モデル>` を起動すると、Claude Code が本物の subagent を起こし、Agent の行が `Backgrounded agent` で出て、状態行の下の subagent の一覧に `◯ codex-subagent:<モデル>  <説明>` が並ぶ。その subagent の手は mod が答え、Anthropic の API を呼ばない。最初の手で `codex app-server` の thread で turn を始め、そのあとは codex のコマンドとファイルの変更 1 つを 1 手にする。手ごとに item を表す tool（`mcp__codex-subagent__command`・`mcp__codex-subagent__file_change`）を呼び、subagent の画面に Claude の `Bash(...)`・`Update(...)` と同じ行で並ぶ。turn が終わると codex の最後の答えを `SubagentHandback` で返し、親に `› Message from @codex-subagent-<モデル>` と `Agent "<説明>" finished` が届く。codex のコマンドはネットワークを使える。

## Sub-features

- `items`: subagent の画面（一覧から開く）に、codex の途中の文が `⏺ <文>`、コマンドが `⏺ Bash(<command>)`、編集が `⏺ Update(<path>)`（新しいファイルは `Write`、消すと `Delete`）の行として 1 つずつ並ぶ。走っている間は `⎿  Running…`、終わると `⎿  <出力>`。終了コードが 0 でないコマンドは `⏺` が赤く、`⎿  Error: Exit code N` と出力が赤で出る（Claude の `Bash` と同じ）。`(MCP)` や plugin の名前は出ない。
- `launch`: Agent の行が `⎿  Backgrounded agent (↓ to manage · ctrl+o to expand)` で出て、親はすぐ次に進む。走っている間、状態行の下の一覧に `◯ codex-subagent:<モデル>  <説明>` が出る。
- `deliver`: 終わると `› Message from @codex-subagent-<モデル>…` が来て、codex の最後の答えが本文になり、`⏺ Agent "<説明>" finished` が出る。本文の頭に Claude Code が「auto mode の分類器が使えなかった」という注記を付ける（ADR 0003 で受け入れた）。
- `network`: codex が `gh api` を走らせ、GitHub の答えが届く。
- `nested`: codex が自分の subagent（`spawn_agent`）を起動でき、その答えが届く。
- `send-running`: 走っている codex subagent に `SendMessage` を送ると、次の item の区切りで `turn/steer` によって codex の今の turn に足され、その turn の答えが親に届く。codex の turn は 1 つのまま。turn が終わったあとに届いた文は、`SubagentHandback` の前に同じ thread の次の turn にする。`SubagentHandback` の区切りで届いた文も同じ thread の次の turn にし、その答えも `SubagentHandback` で親に届く（親には答えが 2 つ届く）。
- `resume`: 終わった codex subagent に `SendMessage` を送ると、`Resuming agent <id>` が出て、同じ thread の次の turn が走り、答えが親に届く。codex は前の turn を覚えている。
- `effort`: Agent tool に `effort` を付けると、codex の turn がその段階で走る。モデルに無い段階は 1 つ下、`max` はモデルの一番上に読み替える。
- `worktree`: Agent tool に `isolation: "worktree"` を付けると、Claude Code が作った worktree で codex が作業する。mod は worktree を作らない。
- `failure`: codex との接続が切れるなど codex 側で失敗すると、`codex failed: <codex のエラー文>` が答えの本文として届く。Claude Code の subagent は `finished` で終わる（失敗の状態で終える口が無い）。Claude のモデルには切り替わらない。
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
- **effort・worktree.** 1 回の起動で両方見る。``$T send codex-$id 'Agent tool で subagent_type "codex-subagent:gpt-6-luna"、effort "xhigh"、isolation "worktree" を付けて起動し、「pwd と git branch --show-current の出力だけを返して」と頼んで。結果が届いたらそのまま見せて。'``、`$T wait codex-$id 'Agent ".*" finished' 300`、`$T shot`。届いた本文の pwd が `.claude/worktrees/agent-<id>` で、branch が `worktree-agent-<id>`。effort は画面に出ないので、`grep -l 'agent-<id>' $(find ~/.codex/sessions -name '*.jsonl' -mmin -5)` で見つけた rollout に `grep -o '"effort":"[a-z]*"'` を流し、`"effort":"xhigh"` が出ることを見る。worktree は変更が無ければ Claude Code が消すので、`git worktree list` に残っていないことも見る。
- **stop.** ``$T send codex-$id 'もう 1 つ、Agent tool で subagent_type "codex-subagent:gpt-6-luna" を起動し、「`sleep 90` を走らせ、そのあと LATE-D とだけ答えて」と頼んで。起動したら 20 秒待ってから（Bash で sleep 20）、TaskStop でその subagent を止めて。'``、`$T wait codex-$id 'stopped' 180`、`$T shot`。`Stop Task ⎿ … · stopped` と `was stopped by Claude` が出て、`Message from` の答えは来ない。codex の側で止まったかは、`grep -l 'sleep 90'` で見つけた `~/.codex/sessions` の新しい rollout に `"type":"turn_aborted"` と `"reason":"interrupted"` があり、`duration_ms` が 90 秒より短いかで確かめる。
- **items・send-running.** codex にファイルを書かせるので、repo の外の一時の dir（`README.md` と `old line` の 1 行の `note.txt` を置く）で Claude Code を起こす。`$T start` は repo のルートに移るので、その dir で `tmux new-session -d -s vmods-codex-$id -x 200 -y 50 -c <dir> claude <起動と同じ引数>` と起こし、あとは `$T` で打つ。``$T send codex-$id 'Agent tool で subagent_type "codex-subagent:gpt-6-luna" を起動して、「まず一言書いてから、ls -la、sleep 25、cat missing.txt をそれぞれ別のコマンドとして順に走らせ、そのあと note.txt の old line を apply_patch で new line に書き換え、最後に ALPHA とだけ答えて」と頼んで。起動したら、Bash で sleep 10 してから SendMessage でその subagent に「最後の答えに BRAVO も足して」と送って。結果が届いたら本文をそのまま書いて。'``、`$T wait codex-$id 'Backgrounded agent' 90`。数秒おいて `$T key codex-$id Down` を 2 回、`$T key codex-$id Enter` で subagent の画面を開き、`sleep 25` が走っている間に `$T shot codex-$id "$run/codex-subagent-items-running.txt"`（色は `tmux capture-pane -e -p -t vmods-codex-$id -S -`）。`⏺ Bash(sleep 25)` の下に `⎿  Running…` が出ている。1 分ほどおいてもう 1 枚撮り、`Bash(cat missing.txt)` の `⏺` と `Error: Exit code 1` が赤（`38;5;211`）、ほかの `⏺` が緑（`38;5;114`）、`Update(note.txt)` の下に `Added 1 line, removed 1 line` があることを見る。`Up`・`Enter` で親の画面に戻り、届いた本文が `ALPHA BRAVO` で始まることを見る。SendMessage の結果は `Message queued for delivery to <id> at its next tool round` のままでよい。今の turn に足されたかは、`grep -l 'sleep 25'` で見つけた `~/.codex/sessions` の新しい rollout で、`"type":"task_started"` が 1 つだけで、`BRAVO` の user message の `turn_id` が `task_complete` のものと同じかで確かめる。
- **send-handback・no-output.** ``$T send codex-$id 'Agent tool で subagent_type "codex-subagent:gpt-6-luna" を起動し、「コマンドを使わずに、ALPHA とだけ答えて」と頼んで。起動の結果が返ったら、待たずにすぐ SendMessage でその subagent に「sleep 2 をコマンドとして走らせてから、答えを ALPHA BRAVO にして」と送って。届いた結果は、届いた順にどれも本文をそのまま書いて。'``、`$T wait codex-$id '^  ALPHA BRAVO' 240`、`$T shot`。`ALPHA` と `ALPHA BRAVO` が別の `Message from` で順に届く。SendMessage の文は、codex が答えを書き終えた `SubagentHandback` の区切りで届く。`sleep 2` の結果が `(No output)` かは、subagent の記録（`~/.claude/projects/<cwd>/<session-id>/subagents/agent-<id>.jsonl`）の `tool_result` で見る。終わった subagent は一覧から消えて画面を開けないので、画面で見るなら走っている間に開く。
- **resume.** 続けて `$T send codex-$id '終わったその subagent に SendMessage で「あなたの前の答えの 1 行目を全部小文字にして、それだけ答えて」と送って。続きの結果が届いたら本文をそのまま書いて。'`、`$T wait codex-$id 'alpha bravo' 180`、`$T shot`。`Resuming agent` のあと `alpha bravo` が届く。同じ rollout の `"last_agent_message"` に `alpha bravo` が 2 つ目として足される。
- **failure.** 最後に回す。`ps -o pid,ppid,command -ax` で、この session の `relay/relay.ts` の pid を親に持つ `codex app-server` を探して `kill` する（行の全体で合わせ、他の session のものに触れない）。`$T send codex-$id 'もう 1 つ、Agent tool で subagent_type "codex-subagent:gpt-6-luna" を起動し、「OK とだけ答えて」と頼んで。結果が届いたら本文をそのまま書いて。'`、`$T wait codex-$id 'finished' 120`、`$T shot`。届いた本文が `codex failed:` で始まる。codex の turn は走らないので無料。
- **cleanup.** `$T send codex-$id '/exit'` のあと数秒おいて `pgrep -fl 'relay/relay.ts|^codex app-server$'` を流し、何も出ないことを見る。

## Gotchas

- `--permission-mode auto` で起こす。item を表す tool は mod の hook が `next(e)` を呼ばずに答えるので、auto mode の判定を通らずに走る。hook が落ちて core に回ると `auto mode's check had no usable answer` で拒まれる。codex のコマンドは codex の sandbox（`workspace-write`）が囲う。
- codex の turn は有料で、1 回 10〜60 秒かかる。安いモデルと短い仕事で確かめる。
- `pgrep` の `codex app-server` は行の全体で合わせる。codex の desktop app が別に起こす `codex app-server --listen unix:// … --managed-daemon` や `daemon pid-update-loop` は mod のものではない。
- `$T turn` の `· done` は、裏の subagent の結果を受けた返答で数えられないことがある。届いたかは `Agent "<説明>" finished` を `$T wait` で待つ。
- `$T wait` に打った文の語を渡すと、入力した行に合ってすぐ抜ける。待つのは mod や Claude Code が出す行の語にする。
- 親が届いた答えに「分類器が使えなかったので確かめていない」と添えるのは、Claude Code の注記によるもので、mod の失敗ではない。
- nested は、mod が thread を `ephemeral: false` で作るから通る。`ephemeral: true` の thread から子を起動すると `no rollout found` で失敗する（`docs/research/codex-app-server.md`）。子の thread の通知も同じ接続に来るが、mod は自分で作った thread の通知しか拾わない。
- 親は文で頼まれないと `effort` を付けない。Agent tool の説明の「頼まれたときだけ付ける」が勝つ（Claude Code 2.1.318・sonnet、深いレビューを頼んでも付けなかった）。effort を見るときは文で指定する。
- worktree の subagent の `turn.step` の hook では、`$.session.cwd()` がその subagent の worktree を返す。`agent.spawn` の `cwd` は `isolation` では埋まらない。
- 入力欄に薄く出る「結果はまだ？」のような文は候補で、打たれていない。
- send-running の文は、送ったときではなく、subagent の次の tool の区切り（item を表す tool が返ったとき）に `session.receive` で mod に届く。item の合間に届くので、codex の turn がまだ走っていれば `turn/steer` で足せる。codex が最後の item のあとに答えを書き終えていれば、次の turn になる。
- 出力の無いコマンド（`sleep 25` など）の行は、終わると Claude の `Bash` と同じく `⎿  (No output)` が出る。
- Claude の subagent の画面は `Bash` の行を `Ran 1 shell command` に畳むが、item を表す tool の行は畳まれず、いつも 1 つずつ並ぶ。
- 一覧の 1 行の文は、Claude Code が要約を描くので古いまま残ることがある（`sleep 25 コマンドを実行中` など）。
- `SubagentHandback` の区切りで届く SendMessage の文は `session.receive` を通らない。Claude Code が subagent の記録に `The coordinator sent a message while you were working:` で始まる隠れた行（`isMeta`）として書くので、mod は `session.append` でその文を持つ。codex にはその行の文がそのまま渡る。
- `--plugin-dir` で読ませた session では、最初に `codex-subagent: its session.append hook was skipped. "cc-plugin-sec-default" runs first and sent the event on past it.` の 1 行が出る。組織の管理 plugin が先に走って、その行を mod の hook に回さなかったという知らせで、mod の失敗ではない（subagent の行は mod に届く）。
- `/tasks` の一覧を開いたままにすると入力を奪う。`Escape` で閉じてから打つ。
- Agent tool に `name` の欄は無い。SendMessage の宛先は、起動の行と一覧に出る agentId になる。
