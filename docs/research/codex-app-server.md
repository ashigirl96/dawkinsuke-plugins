# codex app-server の調査（Codex CLI 0.164.0）

Claude Code の mod から `codex app-server` を外部プロセスとして動かし、subagent の 1 回の呼び出しを GPT の agent の 1 turn に肩代わりさせるための下調べ。tool の呼び出しを流して表示し、最後の答えを取り出すまでに要る事実を集めた。

## 出典と確かめ方

- 手元の版: `codex-cli 0.164.0`（Homebrew で入れたもの）。
- source: openai/codex の tag `rust-v0.164.0`（commit `6aaac69`）。以下の `path:line` はすべてこの tag の repo のルートからの位置。
- 手元で生成したもの: `codex app-server --help`、`codex app-server generate-ts --out <dir>`、`codex app-server generate-json-schema --out <dir>`。型の名前は生成した TypeScript（`v2/*.ts`）から引く。`generate-ts` は既定で実験的（experimental）な field を出さず、`--experimental` を付けると含める。
- 実機: scratch のディレクトリで、Bun の小さな script から `codex app-server` を stdio でつなぎ、turn を 2 回だけ流した（1 回目: shell の command と file の作成、2 回目: subagent の起動）。どちらも `approvalPolicy: "never"`・`sandbox: "workspace-write"`・`ephemeral: true`・`effort: "low"`。
- 0.164.0 の `codex-rs/app-server/README.md` は API の概説ではなく、機能ごとの注記の寄せ集めになっている（`codex-rs/app-server/README.md:1-618`）。全体の流れの説明は古い版（`rust-v0.100.0`）の README にしか無いので、比べるときだけ引く。
- source でも実機でも確かめていないことには **推測** と書く。

## 1. 起動とトランスポート、版

- 起動: `codex app-server`。既定は stdio（`--listen stdio://`、`--stdio` も同じ）。ほかに `unix://`・`unix://PATH`・`ws://IP:PORT`・`off` を選べ、WebSocket には `--ws-auth capability-token|signed-bearer-token` などの認証の option がある（`codex app-server --help`）。`daemon`・`proxy` の subcommand もある（同）。
- `-c key=value` と `--enable/--disable <FEATURE>` で `~/.codex/config.toml` の値を上書きできる（同）。
- framing: 1 行 1 メッセージの JSON（JSONL）。stdin を行ごとに読み（`codex-rs/app-server-transport/src/transport/stdio.rs:73`）、書くときは末尾に改行を足す（同 `:141`）。
- JSON-RPC 2.0 の形だが `"jsonrpc":"2.0"` は送りも期待もしない（`codex-rs/app-server-protocol/src/rpc.rs:1-2`）。実機でも応答に `jsonrpc` は無かった。
- 応答は `{id, result}` か `{id, error}`、通知は `{method, params}`、server から client への要求は `{id, method, params}`。通知には `emittedAtMs` が付く（`codex-rs/app-server-protocol/src/protocol/common.rs` の `ServerNotificationEnvelope`、実機でも確認）。
- 版（v1 と v2）: `initialize` だけが v1 の型を使い、ほかの主な API はすべて v2（`thread/*`・`turn/*`・`item/*`）。v1 の会話 API（`newConversation`・`sendUserMessage`・`addConversationListener` など）は 0.164.0 の要求一覧に無い。残っている v1 は `getConversationSummary`・`gitDiffToRemote`・`getAuthStatus`・`fuzzyFileSearch` と、旧 API 用の承認要求 `applyPatchApproval`・`execCommandApproval` だけ（`common.rs:499-505`、`common.rs:1500-1515`、`common.rs:1870-1882`）。
- `initialize.capabilities.experimentalApi: true` にしないと、`#[experimental]` の付いた method や field は使えず、`"<理由> requires experimentalApi capability"` の error になる（`codex-rs/app-server-protocol/src/experimental_api.rs:30-31`）。

## 2. 握手と 1 turn の流れ

実機で確かめた順番:

1. client → `{"id":1,"method":"initialize","params":{"clientInfo":{"name":"…","title":null,"version":"…"},"capabilities":{"experimentalApi":true}}}`
   - 応答: `{userAgent, codexHome, platformFamily, platformOs}`（`codex-rs/app-server-protocol/src/protocol/v1.rs:72-84`）。
   - capabilities: `experimentalApi`、`optOutNotificationMethods`（通知の method 名を完全一致で止める）など（`v1.rs:43-70`）。
2. client → `{"method":"initialized"}`（通知。`common.rs:2116-2118`）。
   - `initialize` の前に別の要求を送ると `"Not initialized"`（`codex-rs/app-server/src/message_processor.rs:991`）、2 度送ると `"Already initialized"`（`codex-rs/app-server/src/request_processors/initialize_processor.rs:72`）。
3. client → `thread/start`（`common.rs:552-557`、params は `codex-rs/app-server-protocol/src/protocol/v2/thread.rs:62`）。主な field: `model`・`modelProvider`・`cwd`・`approvalPolicy`・`sandbox`・`config`（設定の上書き）・`baseInstructions`・`developerInstructions`・`ephemeral`。
   - 応答: `{thread, model, modelProvider, serviceTier, cwd, approvalPolicy, approvalsReviewer, sandbox, reasoningEffort, …}`。`thread.id` が以後の `threadId`。
   - 続けて `thread/started`、`thread/settings/updated`（experimental）の通知が来た（実機）。
4. client → `turn/start`（`common.rs:1070`、params は `v2/turn.rs:170`）: `{"threadId":"…","input":[{"type":"text","text":"…","text_elements":[]}],"effort":"low"}`。
   - 応答はすぐ返り、`turn.id` と `status:"inProgress"` を持つ（実機）。
   - 続いて `thread/status/changed`（`active`）→ `turn/started` → `item/*` の流れ。
5. 終わり: `turn/completed` `{threadId, turn}`。`turn.status` は `completed`・`interrupted`・`failed`（`v2/turn.rs:33`、`TurnStatus`）。失敗のときは `turn.error = {message, codexErrorInfo, additionalDetails, misalignment}`。直前に `thread/status/changed`（`idle`）が来た（実機）。

1 回目の実機では、開始から `turn/completed` まで約 18 秒、受けたメッセージは 84 行だった。

### 気を付けること（実機で見えたもの）

- `thread/start` で `model` を省くと、`model/list` の `isDefault` ではなく `~/.codex/config.toml` の `model` と `model_reasoning_effort` が使われた。
- `~/.codex` の利用者の設定（hooks・plugin・MCP server・利用者向けの指示）が app-server の thread にもそのまま効く。実機では `hook/started`・`hook/completed`・`mcpServer/startupStatus/updated` が流れ、model は頼んでいない利用者向けの指示 file を `cat` してから作業した。mod から使う thread を利用者の設定から切り離したいなら、`config` の上書きや `baseInstructions` での差し替えが要る（効き方は **推測**）。

## 3. turn 中の通知と item の形

通知の一覧は `common.rs:1967-2112`。item の lifecycle は `item/started` → 0 個以上の delta → `item/completed`。完了した item（`item/completed`）を正とする。どちらも `{item, threadId, turnId, startedAtMs|completedAtMs}`（`ItemStartedNotification`・`ItemCompletedNotification`）。

`ThreadItem` は `type` で分かれる union（`codex-rs/app-server-protocol/src/protocol/v2/item.rs:238`）。Claude Code の tool 表示に写すのに要る型:

| `type` | 主な field | delta の通知 |
|---|---|---|
| `commandExecution`（`item.rs:293`） | `command`（文字列。実機では `/bin/zsh -lc '…'` で包まれていた）、`cwd`、`status`（`inProgress`・`completed`・`failed`・`declined`）、`commandActions`（`read`・`listFiles`・`search`・`unknown` に分けた解釈）、`aggregatedOutput`（stdout と stderr をまとめたもの）、`exitCode`、`durationMs`、`processId`、`source` | `item/commandExecution/outputDelta` `{itemId, delta}`、`item/commandExecution/terminalInteraction` `{itemId, processId, stdin}` |
| `fileChange`（`item.rs:332`） | `changes: [{path, kind, diff}]`（`item.rs:1151`）。`kind` は `{type:"add"}`・`{type:"delete"}`・`{type:"update", move_path}`。`status` は commandExecution と同じ 4 値 | `item/fileChange/patchUpdated` `{itemId, changes}`。`item/fileChange/outputDelta` は旧式（`common.rs:2028`） |
| `mcpToolCall`（`item.rs:339`） | `server`、`tool`、`arguments`、`status`（`inProgress`・`completed`・`failed`）、`result: {content, structuredContent, _meta}`、`error: {message}`、`durationMs` | `item/mcpToolCall/progress` `{itemId, message}` |
| `webSearch`（`item.rs:409`） | `query`、`action`（`search` `{query, queries}`・`openPage` `{url}`・`findInPage` `{url, pattern}`・`other`）、`results` | なし |
| `reasoning`（`item.rs:284`） | `summary: string[]`、`content: string[]` | `item/reasoning/summaryTextDelta` `{itemId, delta, summaryIndex}`、`item/reasoning/summaryPartAdded`、`item/reasoning/textDelta` `{itemId, delta, contentIndex}` |
| `agentMessage`（`item.rs:254`） | `text`、`phase`（`commentary`・`partial_answer`・`final_answer`、無いこともある。`codex-rs/protocol/src/models.rs:975`） | `item/agentMessage/delta` `{itemId, delta}` |
| `plan` | `text`（plan mode の提案） | `item/plan/delta`（experimental） |
| `dynamicToolCall`・`imageView`・`imageGeneration`・`contextCompaction`・`collabAgentToolCall`・`subAgentActivity` など | 8 節を参照 | — |

item ではない turn 単位の通知:

- `turn/plan/updated` `{threadId, turnId, explanation, plan:[{step, status}]}`。`status` は `pending`・`inProgress`・`completed`（`v2/turn.rs:598`）。Claude Code の TodoWrite に当たるのはこれで、`todo` という item は無い。
- `turn/diff/updated` `{threadId, turnId, diff}`。その turn の変更全部をまとめた unified diff（実機では `diff --git a/note.txt b/note.txt …` が file 変更のたびに来た）。
- `thread/tokenUsage/updated`（7 節）、`error` `{error, willRetry, threadId, turnId}`、`warning` など。

実機での形（1 回目、値は一部を省いた）:

```json
{"method":"item/completed","params":{"item":{"type":"commandExecution","id":"exec-…","command":"/bin/zsh -lc 'echo hello && ls -a'","cwd":"…/work","processId":"…","source":"unifiedExecStartup","status":"completed","commandActions":[{"type":"listFiles","command":"ls -a","path":null}],"aggregatedOutput":"hello\n.\n..\n","exitCode":0,"durationMs":0},"threadId":"…","turnId":"…","completedAtMs":…}}
{"method":"item/completed","params":{"item":{"type":"fileChange","id":"exec-…","changes":[{"path":"…/work/note.txt","kind":{"type":"add"},"diff":"hi\n"}],"status":"completed"},"threadId":"…","turnId":"…","completedAtMs":…}}
```

- 短い command では `item/started` と `item/completed` が同じ時刻に来て、`outputDelta` は 1 つも来なかった。表示は `item/completed` の `aggregatedOutput` と `exitCode` を基にし、delta は長い command のときの途中表示に使うのがよい。
- `fileChange` の `kind:add` の `diff` は、unified diff ではなく新しい file の中身そのものだった。`update` のときの形は確かめていない（**推測**: unified diff の hunk）。

## 4. 承認要求、承認方針、sandbox、cwd

- server → client の要求の一覧（`common.rs:1812-1883`）:
  - `item/commandExecution/requestApproval`: params は `{kind:"command"|"writeStdin", threadId, turnId, itemId, approvalId?, reason?, command?, cwd?, commandActions?, proposedExecpolicyAmendment?, proposedNetworkPolicyAmendments?, …}`（`item.rs:1560`）。返事は `{decision}`。`decision` は `"accept"`・`"acceptForSession"`・`{acceptWithExecpolicyAmendment:{…}}`・`{applyNetworkPolicyAmendment:{…}}`・`"decline"`・`"cancel"`（`item.rs:68`）。
  - `item/fileChange/requestApproval`: params は `{threadId, turnId, itemId, reason?, grantRoot?}`（`item.rs:1643`）。返事の `decision` は `"accept"`・`"acceptForSession"`・`"decline"`・`"cancel"`（`item.rs:117`）。
  - ほかに `item/tool/requestUserInput`、`mcpServer/elicitation/request`、`item/permissions/requestApproval`、`item/tool/call`（dynamic tool）、`account/chatgptAuthTokens/refresh` などが来うる。client は知らない要求にも error を返し、turn を止めないようにする。
  - `execCommandApproval`・`applyPatchApproval` は v1 の turn 専用で、`turn/start` で始めた turn では来ない（`common.rs:1870-1882` の注記）。
  - turn が中断されると、答えていない server 要求は server 側で取り下げられる（`codex-rs/app-server/src/bespoke_event_handling.rs:1219-1220`）。答えが付いたことは `serverRequest/resolved` `{threadId, requestId}` で知らされる。
- 承認を出させない設定: `approvalPolicy: "never"`。意味は「承認を求めない。失敗はそのまま model に返し、利用者には上げない」（`codex-rs/protocol/src/protocol.rs:1097-1119`）。値は `"untrusted"`・`"on-request"`・`{granular:{…}}`・`"never"`（`AskForApproval`）。
- sandbox: `thread/start` の `sandbox` は `"read-only"`・`"workspace-write"`・`"danger-full-access"`（`codex-rs/protocol/src/config_types.rs:104-115`）。`turn/start` では `sandboxPolicy` の object（`{type:"workspaceWrite", writableRoots, networkAccess, …}` など）で turn ごとに上書きでき、その turn と以後の turn に効く（`v2/turn.rs:170` の `TurnStartParams`）。
- 実機: 利用者の `config.toml` が `sandbox_mode = "danger-full-access"` でも、`thread/start` に `sandbox:"workspace-write"` を渡すと `thread/settings/updated` の `sandboxPolicy` は `workspaceWrite`（`networkAccess:false`）になった。params は config より優先される。承認要求は 2 回とも 1 度も来なかった。
- cwd: `thread/start.cwd`（thread の既定）と `turn/start.cwd`（その turn と以後の上書き）。実機では command の `cwd` も file の path も、渡した cwd の下になった。git でも project の印も無いディレクトリを `thread/start` しても、project の信頼は保存されない（`codex-rs/app-server/README.md:167-172`）。

## 5. model と reasoning effort、model の一覧

- thread 単位: `thread/start.model`。effort は `thread/start` に専用の field が無く、`config` の上書き（**推測**: `{"model_reasoning_effort":"low"}`）か次の turn 単位で指定する。
- turn 単位: `turn/start.model`・`turn/start.effort`・`turn/start.summary`（`"auto"`・`"concise"`・`"detailed"`・`"none"`）。どれも「この turn と以後の turn」に効く（`TurnStartParams` の doc comment）。実機では `effort:"low"` が `thread/settings/updated` の `effort` に反映された。
- `ReasoningEffort` は型の上では任意の文字列（`ReasoningEffort.ts`）。どの値が使えるかは model ごとの `supportedReasoningEfforts` で決まる。
- `model/list`（`common.rs:1141`）: params は `{cursor?, limit?, includeHidden?}`（`v2/model.rs:54`）、応答は `{data: Model[], nextCursor}`。`Model` の主な field（`v2/model.rs:118`）: `id`、`model`、`displayName`、`description`、`hidden`、`isDefault`、`supportedReasoningEfforts: [{reasoningEffort, description}]`、`defaultReasoningEffort`、`inputModalities`、`multiAgentVersion`、`serviceTiers`、`defaultServiceTier`、`upgrade`。
- 実機の一覧は `config.toml` の model の catalog の設定を映していて、どの model も `multiAgentVersion:"v2"`、effort は `low` から `max`・`ultra` まであった。名前の並びは環境によって違う。

## 6. 中断と終了

- 中断: `turn/interrupt` `{threadId, turnId}`（`v2/turn.rs:357`）、応答は `{}`。応答は中断が実際に済んだとき（内部の `TurnAborted` を受けたとき）に返る（`codex-rs/app-server/src/request_processors/turn_processor.rs:1625-1665`、`bespoke_event_handling.rs:1217-1233`）。そのあと `turn/completed` が `status:"interrupted"` で来る（`bespoke_event_handling.rs:1565`）。実機では、送ると rollout に `"reason":"interrupted"` が残る。
- 走っている turn への追加: `turn/steer` `{threadId, input, expectedTurnId}`、応答は `{turnId}`。`expectedTurnId` が今の turn と違うと失敗する（`codex app-server generate-ts --experimental` の `v2/TurnSteerParams.ts`）。足した指示は同じ turn の最後の答えに反映される（実機で確認）。
- 終了: stdio のときは client が stdin を閉じれば終わる。stdio は 1 client の扱いで（`codex-rs/app-server/src/lib.rs:815`）、その接続が閉じると main loop を抜け（`lib.rs:1215-1218`）、各接続の後片付けと全 thread の shutdown（上限 10 秒）をしてから終わる（`lib.rs:1364-1373`、`codex-rs/app-server/src/request_processors/thread_processor.rs:1339-1350`）。実機では stdin を閉じてから 17〜36ms で exit code 0 で終わった（turn が終わった後で閉じた場合）。turn の途中で閉じたときの振る舞いは確かめていない（**推測**: 上の shutdown で turn も止まる）。
- 終了処理中に送った新しい仕事は `-32600`、`data: {"reason":"serverShuttingDown"}` で断られる（`codex-rs/app-server/README.md:22-26`）。
- thread をやめるだけなら `thread/unsubscribe` `{threadId}` → `{status}`（`v2/thread.rs:734-741`）。

## 7. 最後の答えと token の使用量

- 最後の答え: 次の 2 つのどちらでも取れる。
  - `turn/completed` の `turn.items`。`itemsView:"summary"` のとき、最初の user message と最後の `agentMessage` だけを入れる（`codex-rs/app-server-protocol/src/protocol/turn_items_view.rs:12-30`）。実機では最後の `agentMessage`（`text:"DONE"`、`phase:"final_answer"`）1 つだけが入っていた。
  - `item/completed` のうち `type:"agentMessage"` かつ `phase:"final_answer"` のもの。途中の説明は `phase:"commentary"` で来る（実機）。`phase` は provider によって付かないことがある（`models.rs:975` の doc comment）ので、無いときは最後の `agentMessage` を使う。
  - 古い README（0.100.0）にあった「`turn/completed` の `items` は空」という注意は、0.164.0 には当てはまらない。
- token: `thread/tokenUsage/updated` `{threadId, turnId, tokenUsage:{total, last, modelContextWindow}}`。`total` と `last` は `{totalTokens, inputTokens, cachedInputTokens, cacheWriteInputTokens, outputTokens, reasoningOutputTokens}`（`v2/thread.rs:1980-2001`）。`total` は thread の累計、`last` は直前の model 呼び出し 1 回分。turn の中で何度も来る（実機で 4 回）。`Turn` には使用量の field が無い（`Turn.ts`）ので、1 turn の消費は「turn 開始前の `total`」と「最後の `total`」の差で出す。

## 8. Codex 自身の multi-agent（subagent）

- feature flag（`codex-rs/features/src/lib.rs:1508-1517`）:
  - `multi_agent`（中身は `Collab`）: stable、既定で有効。
  - `multi_agent_v2`: stable、既定で無効。
  - `multi_agent_mode`・`enable_fanout` は削除済みの互換用（同 `:1562-1570`）。
- どちらの版が使われるか（`codex-rs/core/src/config/mod.rs:1658-1685`）: `multi_agent_v2` が有効なら v2、agent が無効なら Disabled、どちらでもなければ model の catalog の `multiAgentVersion`、それも無ければ `multi_agent` が有効なら v1。今の catalog はどの model も `v2` を返したので、flag を触らなくても v2 になる。有効にするだけなら `codex app-server --enable multi_agent_v2` か `-c features.multi_agent_v2=true`。
- tool の名前: v1 は `spawn_agent`・`send_input`・`wait_agent`・`resume_agent`・`close_agent`。v2 は `spawn_agent`・`send_message`・`followup_task`・`interrupt_agent`・`list_agents`（設定で `wait_agent` も）（`codex-rs/core/src/tools/spec_plan.rs:752-781`）。v2 の `spawn_agent` の引数は `{message, task_name, agent_type?, model?, reasoning_effort?, fork_turns?}`（`codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs:203-238`）。
- `thread/start.multiAgentMode`（experimental）は 0.164.0 では「無視される。積極的に subagent を使わせたいなら Ultra の reasoning effort を使う」と書かれている（`v2/thread.rs:110-113`）。既定の `explicitRequestOnly` では、頼んだときだけ subagent を使う（実機の `thread/settings/updated` に `multiAgentMode:"explicitRequestOnly"`）。
- 親の thread に出る item:
  - v1: `collabAgentToolCall` `{tool, status, senderThreadId, receiverThreadIds, prompt, model, reasoningEffort, agentsStates}` を `item/started`・`item/completed` で出す（`codex-rs/core/src/tools/handlers/multi_agents/spawn.rs:81-96`）。`tool` は `spawnAgent`・`sendInput`・`resumeAgent`・`wait`・`closeAgent`・`sendMessage`・`followupTask`・`interruptAgent`・`listAgents`。
  - v2: 起動に成功すると `subAgentActivity` `{kind:"started", agentThreadId, agentPath, model, reasoningEffort}` を出す（`multi_agents_v2/spawn.rs:160-175`、`codex-rs/core/src/tools/handlers/multi_agents_v2.rs:44-52`）。子の turn が終わると `kind:"completed"`（`codex-rs/core/src/agent/control/completion.rs:72-84`）。v2 の `collabAgentToolCall` は analytics にしか送られず、item には出ない（`multi_agents_v2/spawn.rs:49-89`）。起動に失敗すると item は何も出ない。
- 子の thread の event が同じ接続に来るか: source では来る。app-server は thread の作成を見張り、新しい thread ができるたびに、初期化済みのすべての接続に listener を付ける（`lib.rs:1324-1342`、`thread_processor.rs:3832-3900`）。子の `item/*`・`turn/*` は子自身の `threadId` で届き、`Thread.parentThreadId` と `Thread.source`（`SubAgent` の `ThreadSpawn`）で親を辿れる（**推測**: 子の `thread/started` が来るかは確かめていない）。
- 実機（2 回目）: `ephemeral:true` の thread で subagent を頼むと、model の答えは `Subagent spawn failed: no rollout found for thread.` で、子の thread の event は 1 つも来なかった。v2 の `spawn_agent` は `fork_turns` の既定が `"all"`（親の履歴を全部引き継ぐ）で（`multi_agents_v2/spawn.rs:221-233`）、そのとき親の保存済みの履歴（rollout）を読む（`codex-rs/core/src/agent/control/spawn.rs:1116-1132`）。ephemeral の thread は rollout を持たないので失敗した、と読める（**推測**: 原因の特定は source を読んだ上での判断で、`ephemeral:false` での成功は確かめていない）。subagent を使わせるなら `ephemeral` を外すか、model に `fork_turns:"none"` を使わせる必要がある。
- 実機（3 回目、mod `codex-subagent` 経由）: `ephemeral:false` の thread で subagent を頼むと起動に成功した。子の rollout の 1 行目に `"thread_spawn":{"parent_thread_id":"<親の id>"` と `"depth":1` があり、子の `echo nested-ok` の答えが親の thread の最後の答えに入った。

## 9. 認証

- app-server は起動時に `config` の `codex_home`（`~/.codex`）から `AuthManager` を作るので、CLI で `codex login` 済みの ChatGPT のログインをそのまま使う（`lib.rs:598-601`）。このとき `CODEX_API_KEY` の環境変数は読まない（同じ箇所の `enable_codex_api_key_env: false`）。
- 実機: 何もしないで `account/read` が `{account:{type:"chatgpt", email, planType}, requiresOpenaiAuth:true}` を返し、そのまま turn が流れた。起動直後に `account/updated` `{authMode:"chatgpt", planType}` も来た。`initialize` の応答の `codexHome` も `~/.codex` を指していた。
- ログインの API は `account/login/start`・`account/login/cancel`・`account/logout`・`account/rateLimits/read` などがある（`ClientRequest.ts`）。

## 10. 古い文書・記事との違い（0.164.0）

- README が API の概説ではなくなった。`rust-v0.100.0` の README（"Lifecycle Overview"・"Events"・"Approvals" の節）が流れをまとめた最後の形で、0.164.0 では型（`generate-ts`）と source が頼り。
- v1 の会話 API（`newConversation`・`sendUserMessage`・`addConversationListener`）と `codex/event/*` 形式の通知は無い。0.100.0 の README の例にあった `optOutNotificationMethods: ["codex/event/session_configured", …]` は今は意味がない。実機でも `codex/event/*` は 1 つも来なかった。
- WebSocket は 0.100.0 では「実験的でサポート外」だったが、0.164.0 では `unix://` も加わり、WebSocket の認証の option も付いた。
- 承認の返事: 0.100.0 の README は `{"decision":"accept","acceptSettings":{"forSession":false}}` だったが、0.164.0 は `"acceptForSession"` などの値になった（`item.rs:68`、`item.rs:117`）。
- subagent の item: 0.100.0 の README の `collabToolCall`（`receiverThreadId`・`newThreadId`）は、`collabAgentToolCall`（`receiverThreadIds` の配列、`agentsStates`）と、v2 用の `subAgentActivity` に変わった。
- `turn/completed` の `turn.items` に最後の答えが入るようになった（7 節）。0.100.0 の README の「`turn/completed` が token の使用量を持つ」は 0.164.0 の型と合わず、使用量は `thread/tokenUsage/updated` で来る。
- `agentMessage.phase` と `item/fileChange/patchUpdated` が加わり、`item/fileChange/outputDelta` は旧式になった。
- `thread/start.multiAgentMode` は無視されるようになった（8 節）。
- `ReasoningEffort` は列挙ではなく文字列になり、`max`・`ultra` のような値が model の catalog から来る。
