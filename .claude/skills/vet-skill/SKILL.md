---
name: vet-skill
description: 新しいスキルを作る前に、matt と pstack の思想に合うか、既存のスキルや除外中の upstream スキルで足りないかを評価する。この repo にスキルを足したいときに使う。
argument-hint: "[repo|plugin] 案"
---

案は `$ARGUMENTS`。先頭の語が `repo` か `plugin` なら、それは案ではなく置き場所のヒント。空なら会話に出ている案を使う。評価を報告し、ユーザーが判定を選ぶまでスキルのファイルは書かない。

## 1. 案を 4 つの文にする

次の 4 つを 1 文ずつ、ユーザーの言葉で書く。会話から書けない所はユーザーに聞く。

- **失敗**: 実際の session で何がうまくいかなかったか。
- **発火**: いつ、誰が呼ぶか（ユーザーが打つ、model が自分で、別のスキルから）。
- **成果**: 終わったとき何が残るか（ファイル、commit、会話の中の判断など）。
- **置き場所**: この repo の保守だけに使う（`.claude/skills/<name>`）か、plugin として配って他の repo でも使う（`skills/<name>`）か。引数のヒントがあればそれを使う。

matt も pstack も、実際に起きた失敗から足すことを条件にしている。失敗を挙げられなければ、そのことを判定の理由に書く。

## 2. 思想に照らす

`docs/philosophy/matt.md` と `docs/philosophy/pstack.md` を全文読み、次の 5 つに答える。どの答えにも、根拠にした節の見出しを添える。

- **系譜**: matt・pstack・両方・どちらでもない、のどれに近いか。案が当てはまる柱や言い回しを名指しする。
- **反する所**: 両者の思想とぶつかる所。たとえば、段から段へ進む判断を agent に渡す、検証の無い成果を増やす、仕組みで止められることを文章で頼む、code で試さない計画を磨く。
- **接続点**: どのスキルを呼び、どのスキルから呼ばれるか。matt の流れ（`grill-with-docs` から `retro` まで）のどの段に入るか、pstack なら `poteto-mode` のどの層（Non-negotiables・principle・playbook・部品）に当たるか。語彙を扱うなら、語彙の唯一の出典である `domain-modeling`・`codebase-design` との重なり。
- **起動の型**: 利用者だけが呼ぶか、model も呼べるか。利用者だけが呼ぶスキルから利用者だけが呼ぶ別のスキルを呼ぶ形になっていないか。model も呼べるなら、常に読み込まれる description の負荷に見合うか。配るスキルでは、plugin を入れたすべての repo にその負荷がかかる。
- **この環境で効くか**: Claude Code の上で成り立つか。配るスキルなら、この repo のファイル（`docs/`・`upstream/`）を読まずに動くか。Cursor の機能を前提にしていないか。別の model family を前提にするなら、`docs/philosophy/pstack.md` の「書いた者と判定する者を分け、別の model に見せる」に従い codex subagent で読み替えられるかを答える。案が作業の場（Bench・Tab）や claude の session を扱うなら、`docs/monica.md` を読み、monica の上で成り立つかも答える。

## 3. 代わりを探す

案の **失敗** を消せる代わりを、安い順に探す。

1. **入っているスキル**: 配るスキルなら、`.claude/skills/` のものは他の repo に無いので代わりに数えない。
   ```sh
   grep -m1 '^description:' matt/skills/*/SKILL.md pstack/skills/*/SKILL.md skills/*/SKILL.md .claude/skills/*/SKILL.md
   ```
2. **除外中の upstream スキル**: 次の出力。pstack の principle は、規則の本体が description にある。
   ```sh
   sh scripts/ledger.sh | awk -F'\t' '$6 == "excluded" { print $5 "/SKILL.md" }' | xargs grep -m1 '^description:'
   ```
3. **fork**: 入っている matt か pstack のスキルを変えれば足りるか。
4. **スキルにしない**: 保守用なら `scripts/check.sh` のような検査かこの repo の `CLAUDE.md` の 1 行、配るなら `~/.claude/CLAUDE.md` の 1 行か `mods/<name>` の mod で足りるか。
5. **monica**: 手順 2 で `docs/monica.md` を読んだときだけ見る。今の `monica` の CLI で失敗を消せるか。消せなければ、どの入口を足せば消せるか。

1 と 2 の description はすべて読む。役目が重なりそうなものは SKILL.md の本文も読み、案の失敗を消せるかを「足りる」か「足りない: <欠けているもの>」で言う。1 と 2 の全スキルを読み終え、重なる候補のすべてに答えが付いたら完了。

## 4. 判定を報告する

次を報告する。

- 手順 1 の 4 つの文。
- 手順 2 の 5 つの答え。
- 重なる候補の表。列は「スキル」「入っている / 除外中」「足りるか」「欠けているもの」。
- 判定。次から 1 つをおすすめに選び、理由を添える。
  - **既存のスキルで足りる**: どのスキルを、どう使うか。
  - **除外中のスキルを入れる**: `/add-upstream-skill <name>` を案内する。
  - **fork する**: `/fork-upstream-skill` を案内し、`ADR.md` に書く決定の案を添える。
  - **スキルにしない**: 検査か `CLAUDE.md` の 1 行の、置き場所と文面の案。
  - **monica に機能を足す**: `ashigirl96/monica` に立てる issue の文面の案（足すコマンドか引数、関わる monica の ADR）と、その機能が入った後のスキル側の変更（fork か新しく作るか）。
  - **新しく作る**: 手順 1 の置き場所、起動の型、接続点、反する所の避け方。

ユーザーが「新しく作る」を選んだら、`writing-for-agents` スキルで SKILL.md を書く。
