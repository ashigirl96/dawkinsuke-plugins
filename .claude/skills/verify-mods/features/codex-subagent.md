# codex subagent に任せると結果が届く

親が Agent tool で `codex-subagent:<モデル>` を起動すると、Agent の行が本物の subagent と同じく `Backgrounded agent` で出て、裏で `codex app-server` の thread が codex 自身の tool で最後まで走る。終わると `› Prompt from the codex-subagent plugin` の新しい turn が来て、本文の頭に `The codex subagent "<説明>" (codex-subagent:<モデル>, agentId codex-…) finished.` とモデルの出力が届く。codex のコマンドはネットワークを使える。

## Sub-features

- `launch`: Agent の行が `⎿  Backgrounded agent (↓ to manage · ctrl+o to expand)` で出て、親はすぐ次に進む。
- `deliver`: 終わると `› Prompt from the codex-subagent plugin` の turn が来て、codex の最後の答えが届く。
- `network`: codex が `gh api` を走らせ、GitHub の答えが届く。
- `nested`: codex が自分の subagent（`spawn_agent`）を起動でき、その答えが届く。
- `steer`: 走っている codex subagent に `SendMessage` を送ると、行が `Message added to the running turn of codex-…` で出て、届く答えに指示が反映される。
- `resume`: 終わった codex subagent に `SendMessage` を送ると、行が `Resuming agent codex-…` で出て、同じ thread で続きが走り、もう一度 turn が来る。
- `stop`: TaskStop で走っている codex subagent を止めると、行が `<説明> · stopped` で出て、その答えは届かない。
- `cleanup`: `/exit` で、mod が起こした中継（`relay/relay.ts`）と `codex app-server` が止まる。

## How to get to it (user POV)

- 「Agent tool で subagent_type "codex-subagent:gpt-6-luna" を起動して、〜を頼んで」と打つ。種類の名前はモデル ID の `.` を `-` にしたもの。並びは codex の `model/list` で決まるので、`gpt-6-luna` が無ければ一覧の安いモデルに替える。

## Driving it with tui.sh

起動: `$T start codex-$id --setting-sources project --plugin-dir mods/codex-subagent --model sonnet --permission-mode auto`

- **launch・deliver・network.** ``$T send codex-$id 'Agent tool で subagent_type "codex-subagent:gpt-6-luna" を起動し、`gh api rate_limit --jq .rate.limit` を走らせてその出力だけを返すよう頼んで。結果が届いたら、届いた数字をそのまま書いて。'``。`$T wait codex-$id 'Backgrounded agent'` で行を見て、`$T turn codex-$id 2 240` で届いた turn の返答まで待ち、`$T shot codex-$id "$run/codex-subagent-launch-after.txt"`。写しに `Prompt from the codex-subagent plugin`、`finished. What follows is its model output`、`5000` のような数字が並ぶ。数字が出ればネットワークが通っている。
- **nested.** 同じ session で ``$T send codex-$id 'もう 1 つ、subagent_type "codex-subagent:gpt-6-luna" を起動して、「codex 自身の subagent（spawn_agent）を 1 つ起動し、その subagent に `echo nested-ok` を走らせ、subagent の答えをそのまま返して」と頼んで。'``、`$T turn codex-$id 4 400`（この経路だけを新しい session で流すなら `turn` の数は 2）。届いた turn の本文に `nested-ok` が出る。codex が自分で echo しただけでないかは、`find ~/.codex/sessions -name '*.jsonl' -mmin -5` の rollout で確かめる。子の rollout の 1 行目に `"thread_spawn":{"parent_thread_id":"<親の id>"` と `"depth":1` があり、`<親の id>` の rollout に `"name":"spawn_agent"` がある。両方を `$run` に写す。
- **steer・resume・stop.** 別の session で順に打つ。宛先は Agent tool の `name` で指す（agentId でも同じに効く）。
  1. ``$T send codex-$id 'Agent tool で subagent_type "codex-subagent:gpt-6-luna"、name "worker" を起動し、「`sleep 45` を走らせ、そのあと DONE-A とだけ答えて」と頼んで。起動したら、待たずにすぐ SendMessage で to "worker" に「最後の答えに EXTRA-B という語も足して」と送って。届いた結果はそのまま書いて。'``、`$T turn codex-$id 2 300`。SendMessage の行が `Message added to the running turn of`、届いた本文が `DONE-A EXTRA-B`。
  2. ``$T send codex-$id '終わった worker に SendMessage で to "worker"、「さっきの答えに続けて CONT-C とだけ答えて」と送って。届いた結果はそのまま書いて。'``、`$T turn codex-$id 4 300`。行が `Resuming agent codex-…`、2 つ目の turn の本文が `CONT-C`。
  3. ``$T send codex-$id 'もう 1 つ、Agent tool で subagent_type "codex-subagent:gpt-6-luna"、name "sleeper" を起動し、「`sleep 90` を走らせ、そのあと LATE-D とだけ答えて」と頼んで。起動したら、待たずにすぐ TaskStop で task_id "sleeper" を止めて。'``。`Stop Task` の行が `· stopped` で出たら、`$T wait codex-$id 'subagent "Run sleep 90' 110` が切れる（答えが届かない）ことを見る。codex の側で止まったかは、`grep -l 'sleep 90'` で見つけた `~/.codex/sessions` の新しい rollout に `"reason":"interrupted"` があるかで確かめる。
- **cleanup.** 起動の直後に `pgrep -fl 'relay/relay.ts|^codex app-server$'` で 2 つ出ることを見て、`$T send codex-$id '/exit'` のあとにもう一度流し、何も出ないことを見る。

## Gotchas

- `--permission-mode auto` で起こす。親の Agent の呼び出しだけが auto mode の判定を通り、codex のコマンドは codex の sandbox（`workspace-write`）が囲う。
- codex の turn は有料で、1 回 10〜60 秒かかる。安いモデルと短い仕事で確かめる。
- `pgrep` の `codex app-server` は行の全体で合わせる。codex の desktop app が別に起こす `codex app-server --listen unix:// … --managed-daemon` や `daemon pid-update-loop` は mod のものではない。
- 届いた turn の前に、親が起動を伝える返答で 1 回 `done` が数えられる。`turn` の数はその分を足す。
- nested は、mod が thread を `ephemeral: false` で作るから通る。`ephemeral: true` の thread から子を起動すると `no rollout found` で失敗する（`docs/research/codex-app-server.md`）。子の thread の通知も同じ接続に来るが、mod は知らない threadId を無視するので、子の `turn/completed` で親に届けてしまうことはない。
- SendMessage と TaskStop の宛先の照合は mod の対応表で先にするので、`ListAgents` に codex subagent が載らなくても効く。mod が知らない宛先は本物に回る。
- 入力欄に薄く出る「結果はまだ？」のような文は候補で、打たれていない。
