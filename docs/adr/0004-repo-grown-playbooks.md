# poteto-mode を使わず、プレイブックは repo ごとに育てる

pstack は `poteto-mode` 1 つを入口に、全 repo に同じプレイブックと進め方を配る。repo ごとに合う進め方は違うので、`poteto-mode` と `automate-me` は除外し、振り分け役 `/play` とプレイブックのひな形を `setup-dawkinsuke` で各 repo の `.claude/skills/play/` に生成して、そこで育てる。dawkinsuke が配るのは部品スキルとひな形だけで、流れはプレイブックが持つ。そのため、流れを抱え込んでいた `grill-with-docs` の fork は upstream に戻し、その中身を「設計→実装」のプレイブックに移す。

## Considered Options

- `poteto-mode` をそのまま使う: 振り分けとプレイブックの考え方は良いが、プレイブックが plugin 側で固定され、repo の事情に合わせて育てられない。
- `poteto-mode` を fork して自分用の `-mode` を作る（`automate-me` の勧める道）: 1 つの `-mode` を全 repo で共有する点は変わらない。
- 他の pstack スキルが読む Subagents 節と Principles 索引は、`poteto-mode` を Read させず adapter の隣に切り出す: Read では `poteto-mode` 全体が context に載るため。

## Consequences

- プレイブックから手動専用の部品スキルを呼ぶため、skill-chain は repo のスキルから plugin の置き場所を呼ぶ経路と、`playbooks/` の中のファイルを呼び出し元に数える判定を持つ。
- ひな形は生成した時点で repo のものになり、dawkinsuke 側でひな形を直しても既存の repo には届かない。
