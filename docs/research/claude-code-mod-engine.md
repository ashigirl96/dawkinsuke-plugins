# Claude Code の mod の engine の事実（Claude Code 2.1.318）

mod を書くときに、型定義（`.claude-plugin/types/`）と plugin-authoring の手引きからは読めず、実機で確かめて分かった engine の振る舞いを集める。どれも Claude Code 2.1.318 の auto mode で、括弧の issue の試作か実装の中で確かめた。決定の理由は ADR に、mod ごとの確かめ方は `/verify-mods` の `features/` に書き、ここには engine の事実だけを置く。Claude Code を上げたら、使っている事実を確かめ直す。

## hook の持ち時間

- hook の持ち時間は 10 秒で、`$.clock.sleep` の待ちも数えられる。`$.http.fetch` と `$.process.run` の完了を待つ間は数えられない。長く待つ処理は、外の process への `$.http.fetch` の待ちだけで組む。`turn.step` の hook も同じ（#35）。
- `$.clock.now()` は `NaN` を返す。`new Date(...)` が `Invalid Date` になるので、時刻や ID に使わない（#31）。

## subagent の手を mod が答える

- `$.agent.register` で登録した種類の subagent の `turn.step` に mod が答えると、Anthropic の API を呼ばずに手が進む（#31）。
- 手が text だけで終わると、Claude Code が handback を求める文を足して `turn.step` がまた来る。足された文は `$.session.messages()` には出ず、`{ as: 'api' }` で読むと見える。subagent を終えるには `SubagentHandback({ message })` の tool_use を返す（#31）。
- mod が全部の手を答えた subagent の結果には、「auto mode の分類器が使えなかったので、subagent の行動と出力を確かめてほしい」という注記が付く。最後の手だけ本物の model に書かせると注記は付かないが、model が答えを言い換える（#31）。
- mod が返した tool_use を core に回すと、auto mode の判定が答えを出せずに拒む（`auto mode's check had no usable answer`）。その tool の `tool.call` の hook が `next(e)` を呼ばずに自分で答えれば、許可の確認も auto mode の判定も通らずに走る（#31・#35）。
- `tool.call` の hook が `{ deny }` を返すと、その行は Claude の `Bash` の失敗と同じく赤い `⏺` と `Error: <文>` で描かれる（#35）。
- TaskStop は、走っている `turn.step` と `tool.call` の hook の `next.signal` を abort する（#32）。
- `isolation: "worktree"` の subagent の `turn.step` の hook では、`$.session.cwd()` がその subagent の worktree を返す。`agent.spawn` の `cwd` は `isolation` では埋まらない（#34）。

## subagent の一覧

- 状態行の下の subagent の一覧に載るのは、`agent.spawn` を通って Claude Code が起こした subagent だけ。mod が項目を足す API は無い（#31）。
- 種類の名前が長いと、一覧の入れ子の印 `(+1)` が `(…` に切れる。幅 200 の端末で `codex-subagent:gpt-6-luna` でも切れる（#36）。

## subagent への文の届き方

- 走っている subagent への `SendMessage` の文は、送ったときではなく、その subagent の次の tool の区切り（tool が返ったとき）に `session.receive` で届く。tool を呼ばずに走り続ける手の間には届かない（#33・#35）。
- `SubagentHandback` の区切りで届く文は `session.receive` を通らない。Claude Code が subagent の記録に、`The coordinator sent a message while you were working:` で始まる隠れた行（`door: 'prompt'`・`isMeta`）として書くので、`session.append` でしか拾えない（#33）。
- 終わった subagent への `SendMessage` は、Claude Code がその subagent を起こし直す（`Resuming agent <id>`）。起こし直しは `agent.spawn` の `resume` として hook に来る（#33・#36）。

## 入れ子の subagent

- subagent の手として `Agent` の tool_use（`run_in_background: true`）を返すと、Claude Code はそれをその subagent の入れ子として起こし、一覧の親の行に `(+1)` を付け、親の画面の木から子の画面を開ける（#36）。
- mod が返した `Agent` の呼び出しは、`tool.check` の hook で `allow` を返さないと auto mode の判定に拒まれる（#36）。
- `$.agent.spawn` では入れ子にならない。親の `turn.step` の中で呼ぶと、子の `turn.step` がその mod の hook を飛ばして model が答える。`tool.call` の中で呼ぶと、子は main の下に並ぶ。引数に親を渡す欄が無い（#36）。
- 子の結果（`<agent-message from=…>` と `<task-notification>`）は、親の `SubagentHandback` 以外の tool の区切りでしか親に渡らない。渡らないまま親が終わると、Claude Code はその文で親を起こし直す。起こし直しを拒むと、親の画面に `Waiting for 1 background agent to finish` が残る（#36）。

## Agent tool

- Agent tool に `name` の欄は無い。`SendMessage` の宛先は agentId になる（#33）。
- 親の model は、文で頼まれないと `effort` を付けない。Agent tool の `effort` の説明（頼まれたときだけ付ける）が、種類の `description` に書いた文に勝つ（#34、sonnet）。

## 描画

- `ui.render` の `ToolUse` で props の `tool` と `input` を書き換えても、行の引数は MCP の tool の書き方のまま残る。Claude の `Bash(...)` と同じ見た目にするには、自前の木を返す（#35）。
- Claude の subagent の画面は、続く `Bash` の行を `Ran 1 shell command` に畳む。mod の tool の行は畳まれない（#35）。

## 組織の管理 plugin

- 組織の管理 plugin（`cc-plugin-sec-default`）が先に走る環境では、`--plugin-dir` で読ませた mod について、起動時や呼び出しのたびに `<mod>: its <event> hook was skipped. "cc-plugin-sec-default" runs first and sent the event on past it.` の 1 行が出る。`session.append` と `tool.check` で出たが、どちらもログでは mod の hook が走って効いていた（#33・#36）。
- この 1 行は、管理 plugin が `next.to` でユーザー層を飛ばした行に、その mod の hook が掛かっていたときだけ出る。`session.append` では、管理 plugin は人が打った `door: 'prompt'` の行は飛ばさず、それ以外の入口の行を飛ばす。hook を `{ door: 'prompt' }` の matcher で絞ると出なくなり、`{ door: 'compaction' }` に絞っても出なくなる（Claude Code 2.1.319、最初の 1 行を打った直後に 1 度出ていた）。
- `claude plugin test` で `tier: 'prepend'` の inline plugin に `next.to` で飛ばさせると、同じ 1 行は落ちたテストに添えられる「the engine reported」にだけ出る。テストからこの報告を読む API は無く、飛ばした側の `next.trace` にも `$.http.fetch` で外へ送った値にも現れなかったので、この飛ばしをテストで赤にできていない。

## `claude plugin test`

- 偽の `$` の `on('http.fetch')` が空の答えをすぐ返すと、それを繰り返し待つ mod の loop が回り続け、テストが固まる。次の答えができるまで返さずに待つ handler にする（PR #30）。
- テストの中で足す plugin の名前は kebab-case にする。`stepStopper` のような名前は `is no plugin name` で落ちる（PR #30）。
- `turn.step` の途中で `next.signal` を abort する流れは、テストの中で組めていない（PR #30）。
