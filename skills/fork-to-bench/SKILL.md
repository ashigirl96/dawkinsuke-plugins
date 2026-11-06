---
name: fork-to-bench
description: この会話を monica の Bench の新しい Tab に fork し、issue の作業をそこで続けさせて止まる。
argument-hint: "<issue URL> <新しい Tab の最初の prompt>"
disable-model-invocation: true
---

引数: $ARGUMENTS

最初の語が issue の URL（`https://github.com/<owner>/<repo>/issues/<番号>`）で、残りが新しい Tab の最初の prompt になる。最初の語がこの形でないか、残りが空なら、何も流さず、足りない引数を伝えて止まる。

揃っていたら、次を流す。prompt はシェルで 1 つの引数になるよう quote する（中の `'` は `'\''` にする）。

```sh
monica task run <issue URL> --fork "$CLAUDE_CODE_SESSION_ID" '<prompt>'
```

流したら、結果を 1 行伝えて turn を終える。作業は新しい Tab で続く。
