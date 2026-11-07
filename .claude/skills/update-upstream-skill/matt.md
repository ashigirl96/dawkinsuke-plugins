# matt の版の扱い

matt はタグで版を切る。`<旧版>` と `<新版>` はタグ名。

## 版を上げる

1. `CLAUDE.md` の「使っているタグ」を読み、旧版とする。
2. `git -C upstream/mattpocock-skills fetch --tags` を流す。
3. `git -C upstream/mattpocock-skills tag --sort=-v:refname | head -1` で新版を決める。新版が旧版と同じなら、そう報告して終える。
4. `git -C upstream/mattpocock-skills ls-tree -d --name-only <旧版> skills/` と、同じコマンドを `<新版>` で流し、bucket の並びを比べる。
	- `scripts/ledger.sh` の `sources` にある bucket が新版で消えていれば、止めてユーザーに報告する。このまま進むと、`ledger.sh` が exit 2 で止まり、それを使う `sync-skills.sh` と検査がすべて通らなくなる。
	- 新版で増えた bucket があれば、`sources` と `CLAUDE.md` の upstream の節に足すかをユーザーに聞く。`sources` に無い bucket のスキルは、`sync-skills.sh` が何も言わずに飛ばす。
5. `git -C upstream/mattpocock-skills checkout <新版>` を流す。
6. `CLAUDE.md` の「使っているタグ」を新版に書き換える。

完了条件: `git -C upstream/mattpocock-skills describe --tags` が新版を返し、`CLAUDE.md` のタグも新版になっている。

## 増えたスキル

`added <name>` は報告に載せるだけでよい。

## 思想の範囲

`README.md SCOPE.md CHANGELOG.md CONTRIBUTING.md AGENTS.md CLAUDE.md GLOSSARY.md .agents .out-of-scope docs skills`。除外中のスキルも含める。思想の文書は、使っているスキルだけでなく集全体から作者の考えを読んでいるため。

## 報告に足すもの

「版を上げる」の 4 で見つけた bucket の増減と、その対処。
