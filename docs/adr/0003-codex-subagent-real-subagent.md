# codex subagent は Claude Code の本物の subagent として起こし、その手を mod が答えて codex の item を 1 つずつ tool の行にする

0002 を置き換える。0002 の作り（Agent tool の呼び出しを横取りし、裏で起動した形の結果を返す）では、Claude Code の中に本物の subagent が生まれず、状態行の下の subagent の一覧に出なかった。一覧に載るのは `agent.spawn` を通って Claude Code が起こした subagent だけで、mod が項目を足す API は無い。

そこで Agent の呼び出しは横取りせず、`$.agent.register` で登録した種類の subagent を Claude Code に起こさせる。その subagent の `turn.step` は mod が自分で答え、Anthropic の API を呼ばない。最初の手で、`codex app-server` の thread で turn を始める。そのあとは codex の item 1 つを 1 手にする。コマンドの実行（`commandExecution`）とファイルの変更（`fileChange`）が始まるたびに、それを表す mod の tool（`$.tool.register` で足したコマンドの tool とファイルの変更の tool）の tool_use を 1 つ返し、それまでに codex が書いた途中の agent message をその手の text にする。この tool は何も実行せず、codex がすでに走らせている item の完了を待って、その結果を返すだけにする。`turn/completed` が来たら、最後の agent message を `SubagentHandback` で親に返す。subagent の画面には、codex のコマンドと編集が Claude の subagent と同じく 1 つずつ別の tool の行として並ぶ。行は `ui.render` の `ToolUse` で自前の木にして、Claude の `Bash(...)`・`Update(...)` と同じ見た目に描く。props の書き換えでは引数が MCP の書き方のまま残るため（#35）。一覧・裏で走ること・`SendMessage` での再開・TaskStop・結果の届け方は、Claude Code の本物の仕組みに任せる。

この作りが成り立つための条件は 3 つある。どれも Claude Code 2.1.318 の auto mode で試作して確かめた（#31・#35）。

- item を表す tool の `tool.call` の hook は `next(e)` を呼ばずに自分で答える。答えれば、許可の確認も auto mode の判定も通らずに走る。core に回すと、auto mode の判定が答えを出せずに拒む。
- hook の持ち時間は 10 秒で、`$.clock.sleep` はこれに数えられる。`$.http.fetch` や `$.process.run` の完了を待つ間は数えられないので、codex を待つ処理は中継への `$.http.fetch` の待ちだけで組む。`turn.step` の hook も同じで、次の item を待つ間は数えられない（#35）。
- 最後の手は text で終わらせず `SubagentHandback` を返す。text で終わると、Claude Code が handback を求める文を足して `turn.step` がまた来る。

item ごとに tool が返るので、走っている間の `SendMessage` の文は item の合間に `session.receive` で mod に届く。codex の turn が走っていれば `turn/steer` で今の turn に足し、終わっていれば同じ thread の次の turn にする。`SubagentHandback` の区切りで届く文だけは `session.receive` を通らず、Claude Code が subagent の記録に隠れた行として書くので、`session.append` で拾って同じ thread の次の turn にする。

codex が自分で subagent を起こしたとき（親の thread に `subAgentActivity` の `started` が来る。`item/started` と `item/completed` の両方に来るので、子の thread id で重複を除く）、mod は親の codex subagent の手として `Agent` の tool_use を 1 つ返す。種類は親と同じ、`run_in_background: true`、`prompt` の頭は `codex child thread <子の thread id>`。Claude Code はこれを親の codex subagent の入れ子として起こし、一覧の親の行に `(+1)` を付け、親の画面の木から子の画面を開ける（#36）。子の最初の手は `prompt` から thread id を読んで結び、`turn/start` を打たない。子の turn は codex が始めているので、そのあとは今と同じく item ごとに 1 手、子の thread の `turn/completed` で `SubagentHandback`。子の thread の通知は、子の Claude Code の subagent ができる前から届くので、通知は thread ごとの列に持つ。

mod が返した `Agent` の呼び出しは、model の要求を経ていないので、auto mode の判定が答えを出せずに拒む。そこで `tool.check` の hook（`Agent`）で、codex subagent の中から出た、mod が起こすと決めた子の thread id を `prompt` に持つ呼び出しにだけ `allow` を返す。auto mode の安全確認を mod が飛ばすことになるが、範囲はこの呼び出しに絞り、子のコマンドも codex の sandbox が囲う。ユーザーが試作を確かめて受け入れた。組織の管理 plugin が先に `tool.check` に答える環境では、この許可が届かず、子を起こす `Agent` が拒まれるおそれがある。

子の結果（`<agent-message from=…>` と `<task-notification>`）は、Claude Code が親の `SubagentHandback` 以外の tool の区切りでしか親に渡さない。渡らないまま親が終わると、Claude Code はその文で親を起こし直す。起こし直しを通すと、mod はその文で codex の turn をもう 1 つ打ち（有料）、main に答えが 2 通届く。拒むと、親は一覧に残り、親の画面に `Waiting for 1 background agent to finish` が残る。そこで、codex が子の終わりを親の thread に知らせる `subAgentActivity` の `completed` を、親の手（`Wait(<子の名前>)` の行になる mod の tool）にする。その tool は、子の Claude Code の subagent が終わるまで待ってから答えるので、その区切りで子の結果が親に渡る。それでも親が起こし直されたら、`agent.spawn` の hook で拒む。codex はすでに子の答えを親の thread で受け取っているから。

mod が全部の手を答えた subagent の結果には、Claude Code が「auto mode の分類器が使えなかったので、subagent の行動と出力を確かめてほしい」という注記を付ける。これは受け入れる。codex の出力は、もともと親が確かめてから使うものだから。

## Considered Options

- codex の turn 全体を codex の tool 1 回で包む（#32〜#34 の形）: subagent の画面に `Running…` の行が 1 つ出るだけで、codex が何をしているかが見えない。走っている間の `SendMessage` も tool が返るまで届かず、今の turn に足せない。item ごとに 1 手にする形に替えた（#35）。
- 0002 の作り（Agent の横取り）を続ける: 一覧に出ないので採らない。経過を入力欄の上の帯（`AbovePrompt`）に描いて補う案もあったが、一覧・`SendMessage`・TaskStop を mod が真似し続けることになり、起動の途中の競合の対策もそのぶん抱える。
- 最後の手だけ本物の model（haiku など）に `SubagentHandback` を書かせて、注記を消す: model が codex の答えを言い換えるので、親に届くのが GPT の出力そのものでなくなる。費用もかかる。注記を受け入れるほうを採る。
- codex の子を `$.agent.spawn` で起こす（#36 の試作）: どの hook から呼んでも入れ子にならない。親の `turn.step` の中で呼ぶと、子の `turn.step` がこの mod の hook を飛ばして model が答える。mod の tool の `tool.call` の中で呼ぶと手は答えられるが、子は main の下に親と並び、`(+1)` は出ず、子の結果が main に届いて main の model が余計な 1 ターンを使う。`$.agent.spawn` の引数には親を渡す欄がない。
- 子の結果を親に渡すため、親の `SubagentHandback` の前に一度 text も tool も無い手で turn を終える（#36）: Claude Code は handback を求める文を足して手を求めるだけで、子の結果は渡さず、親が終わったあとに起こし直した。
- 子の結果で親が起こし直されるのを通し、その手を mod が codex を打たずに答える（試していない）: text で終えると Claude Code が handback を求めるので、起こし直された親も `SubagentHandback` で終わり、main に答えが 2 通届く見込み。
- subagent の手を mod が答え、Claude Code の Bash・Write などを呼ぶ: 0002 で退けた理由（auto mode の判定が出ずに拒まれる、自動圧縮が gpt のモデル名で落ちる）がそのまま当たるので採らない。
