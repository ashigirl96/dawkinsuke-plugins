# codex subagent は Claude Code の本物の subagent として起こし、その手を mod が答えて codex の tool を呼ぶ

0002 を置き換える。0002 の作り（Agent tool の呼び出しを横取りし、裏で起動した形の結果を返す）では、Claude Code の中に本物の subagent が生まれず、状態行の下の subagent の一覧に出なかった。一覧に載るのは `agent.spawn` を通って Claude Code が起こした subagent だけで、mod が項目を足す API は無い。

そこで Agent の呼び出しは横取りせず、`$.agent.register` で登録した種類の subagent を Claude Code に起こさせる。その subagent の `turn.step` は mod が自分で答え、Anthropic の API を呼ばない。最初の手で、mod が `$.tool.register` で足した codex の tool を 1 回呼び、その tool の `tool.call` の hook が `codex app-server` の thread で turn を最後まで走らせて、最後の agent message を tool の結果にする。次の手で、その結果を `SubagentHandback` で親に返す。一覧・裏で走ること・`SendMessage` での再開・TaskStop・結果の届け方は、Claude Code の本物の仕組みに任せる。

この作りが成り立つための条件は 3 つある。どれも Claude Code 2.1.318 の auto mode で試作して確かめた（#31）。

- codex の tool の `tool.call` の hook は `next(e)` を呼ばずに自分で答える。答えれば、許可の確認も auto mode の判定も通らずに走る。core に回すと、auto mode の判定が答えを出せずに拒む。
- hook の持ち時間は 10 秒で、`$.clock.sleep` はこれに数えられる。`$.http.fetch` や `$.process.run` の完了を待つ間は数えられないので、codex を待つ処理は中継への `$.http.fetch` の待ちだけで組む。
- 最後の手は text で終わらせず `SubagentHandback` を返す。text で終わると、Claude Code が handback を求める文を足して `turn.step` がまた来る。

mod が全部の手を答えた subagent の結果には、Claude Code が「auto mode の分類器が使えなかったので、subagent の行動と出力を確かめてほしい」という注記を付ける。これは受け入れる。codex の出力は、もともと親が確かめてから使うものだから。

## Considered Options

- 0002 の作り（Agent の横取り）を続ける: 一覧に出ないので採らない。経過を入力欄の上の帯（`AbovePrompt`）に描いて補う案もあったが、一覧・`SendMessage`・TaskStop を mod が真似し続けることになり、起動の途中の競合の対策もそのぶん抱える。
- 最後の手だけ本物の model（haiku など）に `SubagentHandback` を書かせて、注記を消す: model が codex の答えを言い換えるので、親に届くのが GPT の出力そのものでなくなる。費用もかかる。注記を受け入れるほうを採る。
- subagent の手を mod が答え、Claude Code の Bash・Write などを呼ぶ: 0002 で退けた理由（auto mode の判定が出ずに拒まれる、自動圧縮が gpt のモデル名で落ちる）がそのまま当たるので採らない。
