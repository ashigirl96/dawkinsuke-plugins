# mermaid の図を罫線で描く

model の返答に `` ```mermaid `` のコードブロックがあると、端末ではコードの代わりに罫線（`┌` `│` `▼`）の図が出る。描き終わるまでは元のコードが出て、描けたら差し替わる。`/mermaid off` でコードのままに戻し、`/mermaid ascii` で描画に戻す。

## Sub-features

- `draw`: `flowchart`・`sequenceDiagram`・`stateDiagram-v2` を罫線で描く。
- `toggle`: `/mermaid off` / `/mermaid ascii` / `/mermaid`（今の状態を出す）。
- `fail`: 描けない図は、元のコードの下に `mermaid-render: <理由>` を 1 行出す。
- `truncate`: 端末より広い図は折り返さず行末で切る。

## How to get to it (user POV)

- 図を頼む（「この流れを mermaid で描いて」）。返答の中の図が罫線で出る。
- `/mermaid` と打って切り替える。

## Driving it with tui.sh

Preconditions:

- Doctor の `ls node_modules/beautiful-mermaid/package.json` が通っている。

起動: `$T start mermaid-$id --setting-sources project --plugin-dir mods/mermaid-render --model sonnet`

- **draw.** `$T shot mermaid-$id "$run/mermaid-draw-before.txt"` のあと、`$T send mermaid-$id 'Reply with only a mermaid fenced code block for: flowchart TD, node A labeled start, node B labeled end, A to B. No other text.'` を打ち、`$T wait mermaid-$id '┌'` を待って `$T shot mermaid-$id "$run/mermaid-draw-after.txt"`。after に `│start│` と `│ end │` が罫線の箱で並び、`flowchart TD` の行が残っていない。
- **toggle.** 同じ session で `$T send mermaid-$id '/mermaid off'` を打ち、`$T wait mermaid-$id 'mermaid: off'`。画面の図が `flowchart TD` のコードに戻る（`shot` して `-off.txt`）。`/mermaid ascii` で `mermaid: ascii` が出て、図が戻る。`/mermaid` だけなら `mermaid: ascii (use /mermaid ascii|off)`。
- **fail.** 新しい session で `$T send mermaid2-$id 'Reply with only a mermaid fenced code block whose body is the single line: pie title X. No other text.'`。`$T wait mermaid2-$id 'mermaid-render: '`。元のコードの下に理由の 1 行が出る。

## Gotchas

- 入力欄に `` ``` `` と改行を打つと崩れるので、図は model に作らせる。打つ文は 1 行にする。
- model が地の文を付け足しても合否には関係ない。合否は罫線の箱が出たかで決める。
- 描画の結果は `$.state` に `RENDER_VERSION` 付きで残る。`render/render.ts` を直したのに図が変わらないときは、`hooks/register.tsx` の `RENDER_VERSION` が上がっているかを見る。
- 失敗は `$.state` に残らない。mod を読み直すと描き直す。
- 対応しない図の種類（`pie` など）が beautiful-mermaid の版で描けるようになったら、`fail` に使う図を変える。
