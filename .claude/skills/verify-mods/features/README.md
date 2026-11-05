# mods 検証マップ

`mods/` の mod が、本物の Claude Code の画面と会話で効いていることを確かめる手順の正本。駆動の前にこの索引を読み、該当する機能のファイルを手順として使う。

## Baseline preconditions

- repo のルートにいて、`../SKILL.md` の Doctor が全部通っている。
- `$run` と `$id` を Launch で決めてある。
- `T=.claude/skills/verify-mods/tui.sh` を使う。
- 確かめる mod だけを `--plugin-dir` で読ませる。別の mod を混ぜると、同じ描画を取り合って印が出ないことがある。

## Driving conventions

- 打つのはユーザーが打つ文とスラッシュコマンドだけ。mod の関数や `$.state` を直に触らない。
- 1 つの経路に 1 つの tmux session を使う。経路をまたいで状態（glossary の用語の一覧、mermaid-render の `/mermaid` の切り替え）が残るので、別の経路は別の session で起こす。
- 待つのは mod の印。model の文の言い回しを待たない。

## Proof and skip reporting

- 経路ごとに、打つ前と後の `$T shot` を `$run/<機能>-<経路>-{before,after}.txt` に残す。会話の記録を使う経路は jsonl も写す。
- 印が出なかったときは、画面の写しと「何を待って何秒で切れたか」を書いて報告する。
- 流せなかった経路は、満たせなかった前提を書いて報告する。別の経路で確かめたことにしない。

## Feature entry contract

各ファイルは H1 の題と、ユーザーから見た振る舞いを書いた 1 段落で始まり、`Sub-features`、`How to get to it (user POV)`、`Driving it with tui.sh`、`Gotchas` の 4 つの H2 をこの順に持つ。

## Features

- [mermaid の図を罫線で描く](./mermaid-render.md): 返答の `` ```mermaid `` が端末で罫線の図になり、`/mermaid off` で元のコードに戻る。
- [用語をコマンドで引く](./glossary-command.md): `/glossary 用語` と `/glossary-session 用語` が右の pane に用語を出す。
- [用語を聞くと pane に出る](./glossary-tool.md): 「〇〇って何?」と聞くと、model が `show_terms` を呼び、pane に出す。
- [手動専用のスキルを連鎖で呼ぶ](./skill-chain.md): 呼び出し元のスキルが名指しした手動専用のスキルだけが、Skill tool で呼べる。
- [codex subagent に任せると結果が届く](./codex-subagent.md): `codex-subagent:<モデル>` の Agent が裏で codex に走り、最後の答えが親の新しい turn として届く。
