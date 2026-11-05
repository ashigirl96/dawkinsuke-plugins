# codex subagent は Agent tool の呼び出しを横取りし、codex が自分の tool で最後まで走る

mod は起動時に `model/list` のモデルごとに subagent の種類（`codex-subagent:<モデル ID の . を - にしたもの>`）を登録し、その種類の Agent tool の呼び出しを `tool.call` で横取りする。Claude Code には裏で起動した形の結果（`status: "async_launched"`）を返し、中では `codex app-server` の thread が codex 自身の tool（shell・apply_patch）で最後まで走る。結果は終わったあとに `$.prompt.submit` で親に届け、宛先がその ID の `SendMessage` と TaskStop も横取りして codex に渡す。auto mode の判定は親が Agent tool を呼ぶ 1 回だけで、中のコマンドは codex の sandbox が囲う。

## Considered Options

- subagent の `turn.step` を横取りして頭脳だけを codex に差し替え、tool は Claude Code が実行する: Claude Code は subagent の 1 手ごとに Anthropic の API を呼ぶ前提で、auto mode の判定と自動圧縮をその API に載せている。応答を自前で作ると判定が出ずに Write・Bash・Agent が拒まれ（subagent の定義で `permissionMode` を変えても親の auto mode が勝つ）、自動圧縮は gpt のモデル名で API を呼んで subagent ごと落ちるので採らない。
- 専用の tool（`$.tool.register`）を足し、引数で model・effort・cwd を受け取る: モデル ID をそのまま渡せるが、Agent tool・`SendMessage`・TaskStop と別の口になり、Claude の subagent と仕様が揃わないので採らない。
- OpenAI の API を直接呼ぶ: 使えるモデルの一覧・アカウントごとの公開状況・ログインを自前で抱えることになる（opencodex の `native-models.ts` が抱えている事情）ので採らない。
