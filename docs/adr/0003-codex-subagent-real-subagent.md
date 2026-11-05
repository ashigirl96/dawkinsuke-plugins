# codex subagent は Claude Code の本物の subagent として起こし、その手を mod が答えて codex の item を 1 つずつ tool の行にする

0002 を置き換える。0002 の作り（Agent tool の呼び出しを横取りし、裏で起動した形の結果を返す）では、Claude Code の中に本物の subagent が生まれず、状態行の下の subagent の一覧に出なかった。一覧に載るのは `agent.spawn` を通って Claude Code が起こした subagent だけで、mod が項目を足す API は無い。

そこで Agent の呼び出しは横取りせず、`$.agent.register` で登録した種類の subagent を Claude Code に起こさせる。その subagent の `turn.step` は mod が自分で答え、Anthropic の API を呼ばない。最初の手で、`codex app-server` の thread で turn を始める。そのあとは codex の item 1 つを 1 手にする。コマンドの実行（`commandExecution`）とファイルの変更（`fileChange`）が始まるたびに、それを表す mod の tool（`$.tool.register` で足したコマンドの tool とファイルの変更の tool）の tool_use を 1 つ返し、それまでに codex が書いた途中の agent message をその手の text にする。この tool は何も実行せず、codex がすでに走らせている item の完了を待って、その結果を返すだけにする。`turn/completed` が来たら、最後の agent message を `SubagentHandback` で親に返す。subagent の画面には、codex のコマンドと編集が Claude の subagent と同じく 1 つずつ別の tool の行として並ぶ。行は `ui.render` の `ToolUse` で自前の木にして、Claude の `Bash(...)`・`Update(...)` と同じ見た目に描く。props の書き換えでは引数が MCP の書き方のまま残るため（#35）。一覧・裏で走ること・`SendMessage` での再開・TaskStop・結果の届け方は、Claude Code の本物の仕組みに任せる。

この作りが成り立つための条件は 3 つある。どれも Claude Code 2.1.318 の auto mode で試作して確かめた（#31・#35）。

- item を表す tool の `tool.call` の hook は `next(e)` を呼ばずに自分で答える。答えれば、許可の確認も auto mode の判定も通らずに走る。core に回すと、auto mode の判定が答えを出せずに拒む。
- hook の持ち時間は 10 秒で、`$.clock.sleep` はこれに数えられる。`$.http.fetch` や `$.process.run` の完了を待つ間は数えられないので、codex を待つ処理は中継への `$.http.fetch` の待ちだけで組む。`turn.step` の hook も同じで、次の item を待つ間は数えられない（#35）。
- 最後の手は text で終わらせず `SubagentHandback` を返す。text で終わると、Claude Code が handback を求める文を足して `turn.step` がまた来る。

item ごとに tool が返るので、走っている間の `SendMessage` の文は item の合間に `session.receive` で mod に届く。codex の turn が走っていれば `turn/steer` で今の turn に足し、終わっていれば同じ thread の次の turn にする。`SubagentHandback` の区切りで届く文だけは `session.receive` を通らず、Claude Code が subagent の記録に隠れた行として書くので、`session.append` で拾って同じ thread の次の turn にする。

mod が全部の手を答えた subagent の結果には、Claude Code が「auto mode の分類器が使えなかったので、subagent の行動と出力を確かめてほしい」という注記を付ける。これは受け入れる。codex の出力は、もともと親が確かめてから使うものだから。

## Considered Options

- codex の turn 全体を codex の tool 1 回で包む（#32〜#34 の形）: subagent の画面に `Running…` の行が 1 つ出るだけで、codex が何をしているかが見えない。走っている間の `SendMessage` も tool が返るまで届かず、今の turn に足せない。item ごとに 1 手にする形に替えた（#35）。
- 0002 の作り（Agent の横取り）を続ける: 一覧に出ないので採らない。経過を入力欄の上の帯（`AbovePrompt`）に描いて補う案もあったが、一覧・`SendMessage`・TaskStop を mod が真似し続けることになり、起動の途中の競合の対策もそのぶん抱える。
- 最後の手だけ本物の model（haiku など）に `SubagentHandback` を書かせて、注記を消す: model が codex の答えを言い換えるので、親に届くのが GPT の出力そのものでなくなる。費用もかかる。注記を受け入れるほうを採る。
- subagent の手を mod が答え、Claude Code の Bash・Write などを呼ぶ: 0002 で退けた理由（auto mode の判定が出ずに拒まれる、自動圧縮が gpt のモデル名で落ちる）がそのまま当たるので採らない。
