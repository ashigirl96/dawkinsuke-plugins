# pstack の版の扱い

pstack-claude はタグ（`v0.9.157` の形）で版を切る。`<旧版>` と `<新版>` はタグ名。

## 版を上げる

1. `CLAUDE.md` の「使っているタグ」を読み、旧版とする。
2. `git -C upstream/pstack-claude fetch --tags` を流す。
3. `git -C upstream/pstack-claude tag --sort=-v:refname | head -1` で新版を決める。新版が旧版と同じなら、そう報告して終える。
4. `git -C upstream/pstack-claude ls-tree -d <新版> plugins/pstack/skills plugins/pstack/agents` が 2 行を返さなければ、スキルか agent の置き場所が移っている。このまま進むと `scripts/ledger.sh` が exit 2 で止まるか、ルートの `agents` の symlink が切れるので、止めてユーザーに報告する。
5. `git -C upstream/pstack-claude checkout <新版>` を流す。
6. `CLAUDE.md` の「使っているタグ」を新版に書き換える。

完了条件: `git -C upstream/pstack-claude tag --points-at HEAD` が新版を返し、`CLAUDE.md` のタグも新版になっている。

## 増えたスキル

`added <name>` は報告に載せるだけでよい。pstack はすべてのスキルを使う。

増えたスキルや agent の本文に `pstack:<name>` と plugin 名付きの呼び名があれば、dawkinsuke では `dawkinsuke:<name>` で登録されるので、`/fork-upstream-skill` で呼び名を書き換える fork にするかをユーザーに聞く。`grep -rn 'pstack:' upstream/pstack-claude/plugins/pstack/skills/<name>` で探す。

## 思想の範囲

`plugins/pstack README.md CONTEXT.md docs`。除外中のスキルも含める。思想の文書は、使っているスキルだけでなく集全体から作者の考えを読んでいるため。

## 報告に足すもの

「増えたスキル」で見つけた `pstack:` の呼び名と、その対処。
