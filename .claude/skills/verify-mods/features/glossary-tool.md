# 用語を聞くと pane に出る

会話で「〇〇って何?」と聞くと、model が glossary の tool `mcp__glossary__show_terms` を呼び、右の「用語辞典」の pane に用語を出す。chat には 1 行の要約だけが返る。端末が狭くて pane を置けないときは、tool が model に「chat にも詳しく書け」と返す。

## Sub-features

- `ask`: 質問から tool が呼ばれ、pane に出る。
- `multi`: 1 回の質問で複数の用語を渡すと、最初の用語が見出しになり、残りが下に並ぶ。
- `narrow`: pane を置けない幅では、chat に詳しい説明が出る。

## How to get to it (user POV)

- 「skill-chain って何?」のように、ふだんの言葉で聞く。

## Driving it with tui.sh

起動: `$T start gtool-$id --setting-sources project --plugin-dir mods/glossary --model sonnet`

- **ask.** `$T send gtool-$id 'skill-chain って何?'`、`$T wait gtool-$id '┃ skill-chain' 180`、続けて `$T turn gtool-$id 1`、`$T shot gtool-$id "$run/glossary-tool-after.txt"`。pane に見出しと `この codebase では` の節が出て、節に `mods/skill-chain` のファイル名が出る。chat の返答は短い。
- **multi.** `$T send gtool-$id 'mod と hook ってそれぞれ何?'`。見出しが片方になり、もう片方が下に並ぶ。
- **narrow.** 幅を縮めた session（`tmux resize-window -t vmods-gnarrow-$id -x 80` を `start` の直後に流す）で `ask` を流す。pane が出ず、chat に詳しい説明が出る。

## Gotchas

- tool を呼ぶかは model が決める。呼ばずに chat で答えたときは、mod の失敗ではなく tool の説明文が効かなかったと報告する。そのときは会話の記録（`--session-id` を渡して起動）で `show_terms` の `tool_use` が無いことを示す。
- model はコードを読みに行ってから tool を呼ぶので、`ask` は 1〜3 分かかる。
- 利用者の設定に入れてある glossary が混ざると、同じ tool 名を取り合う。`--setting-sources project` を外さない。
