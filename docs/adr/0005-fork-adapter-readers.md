# adapter を読ませる pstack スキルは fork し、adapter は fork を作るときの翻訳の決まりにする

ADR 0001 は Cursor の名前の読み替えを adapter 1 枚に置き、各スキルが実行中に読む形にした。これだと pstack のスキルを呼ぶ session ごとに adapter 全体（約 2 千トークン）が context に載り、読み替えも model がその場で行うので漏れうる。そこで adapter を読ませる行を持つスキルはすべて fork し、本文を最初から Claude Code の名前で書いて、adapter を読ませる行を消す。adapter は実行中には読まれず、各 fork の `ADR.md` が「adapter のどの節に従って書き換えるか」を引く翻訳の決まりとして残る。

## Considered Options

- adapter 1 枚を実行中に読ませる（ADR 0001）: 上の context の負担と読み替えの漏れがある。
- adapter を目次と節に分け、要る節だけ読ませる: 負担は減るが、実行中の依存と読み替えの漏れは残る。
- 写しを作らず fork の本文に読み替えの表を直接書く: モデル名の表が 7 本に散り、表を直すたびに 7 か所を直すことになる。

## Consequences

- adapter の節が変わったら、その節を引く fork を作り直す。upstream の差分だけを見ると古い fork が残るので、`/update-upstream-skill` と `/fork-upstream-skill` がこれを扱う。
- 読み替えが重いのに使わないスキル（`poteto-mode`・`automate-me`・`figure-it-out`・`recall`・`setup-pstack`）は fork せず除外する。モデル表は `setup-dawkinsuke` が書く。
