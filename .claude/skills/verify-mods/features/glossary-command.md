# 用語をコマンドで引く

`/glossary 用語` と打つと、右に「用語辞典」の pane が開き、少し待つとその用語の日本語・英語・ニュアンス・この codebase での意味が出る。調べている間は「「用語」を調べています」が出て、入力欄は空いたまま。`/glossary-session 用語` は今の会話も踏まえて調べる。引数なしの `/glossary` は pane を開くか、開いていれば閉じる。

## Sub-features

- `lookup`: `/glossary 用語` が GLOSSARY.md を踏まえて haiku で調べる。
- `lookup-session`: `/glossary-session 用語` が会話を fork して調べる。会話がまだ無ければ sonnet で調べる。
- `toggle`: 引数なしの `/glossary` が pane を開閉する。
- `history`: 引いた用語が新しい順に最大 50 個残り、2 つ目からは pane の下に番号付きで並ぶ。数字を押すとその用語に切り替わる。
- `fail`: 答えが形にならないと「用語辞典: 「用語」を調べられませんでした」の toast を出す。

## How to get to it (user POV)

- 会話の途中で分からない語を `/glossary` に渡す。

## Driving it with tui.sh

起動: `$T start glossary-$id --setting-sources project --plugin-dir mods/glossary --model sonnet`

- **toggle.** `$T send glossary-$id '/glossary'` を打ち、`$T wait glossary-$id '用語を調べると、ここに出ます'`。もう一度打つと、その文が画面から消える（`shot` して比べる）。
- **lookup.** `$T send glossary-$id '/glossary mod'`、`$T wait glossary-$id '┃ この codebase では' 90`、`$T shot glossary-$id "$run/glossary-lookup-after.txt"`。pane に `┃ mod` の見出し、`ニュアンス`、`この codebase では` の節が出る。
- **history.** 同じ session で `$T send glossary-$id '/glossary hook'`、見出しが `┃ hook` に替わるのを待つ。pane の下に `mod` が並ぶ。`$T key glossary-$id 1` で見出しが `┃ mod` に戻る。
- **lookup-session.** 新しい session で何か 1 往復話してから `/glossary-session <その会話に出た語>`。`この codebase では` の節が会話の中身に触れる。
- **GLOSSARY.md を踏まえる.** repo に GLOSSARY.md が無いときだけ、仮に置く。

```sh
[ -e GLOSSARY.md ] || printf '<!-- verify-mods scaffolding -->\n# Glossary\n\n- **ポニテ**: verify-mods の検証用の仮の語。\n' > GLOSSARY.md
```

  `/glossary ポニテ` の `この codebase では` に「検証用」と GLOSSARY.md が出る。終わったら `head -1 GLOSSARY.md | grep -q 'verify-mods scaffolding' && rm GLOSSARY.md`。

## Gotchas

- この repo のルートには GLOSSARY.md が無い（2026-11 時点）。そのため `lookup` の `この codebase では` は「GLOSSARY.md が空で判断できない」と書く。これは正しい振る舞いで、失敗ではない。
- `$.fs.read('GLOSSARY.md')` は起動した場所から読む。`tui.sh` は repo のルートで起動する。
- pane は端末が狭いと置かれない。`tui.sh` は幅 200 で起動する。幅を変えたら、`┃` が出るかを先に見る。
- 用語の一覧は `$.state` に残り、Claude Code を起こし直しても残る。`history` を最初から確かめたいときは、前の run の用語が並んでいても合否には使わない。
