---
name: fork-to-bench
description: 会話で固まった決定を issue にし、この会話を monica の Bench の新しい Tab に fork して `/tackle` で実装させる。
disable-model-invocation: true
---

この会話で合意した、新しい 1 つの context window に収まる作業を Bench に移す。

1. テストする seam を利用者と確かめる。会話で決まっていれば飛ばす。
2. `ready-for-agent` の label を付けた issue を立てる。本文は、合意した決定を数行（バグなら確かめた原因と再現手順）、seam、この session で足した ADR と用語集の用語だけにする。
3. この checkout から `[DEBUG-` で始まる計測を消す。残った commit していない変更は、新しい Tab が worktree へ移す。
4. 次を流し、結果を 1 行伝えて turn を終える。`<this checkout>` は今の checkout の絶対 path にする。作業は新しい Tab で続く。

```sh
monica task run <issue URL> --fork "$CLAUDE_CODE_SESSION_ID" '/tackle Work from the decisions in this conversation instead of fetching the issue; it only records them. Paths earlier in this conversation point at <this checkout>. First move the uncommitted changes this session made there into the current directory and revert them in <this checkout>; after that, edit only under the current directory.'
```
