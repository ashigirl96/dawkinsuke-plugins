# pstack の思想

`upstream/cursor-plugins` の `harness/pstack/` の作者 Lauren Tan（poteto）が何を問題と見て、skill の集をどう組んで答えているかをまとめる。pstack のスキルを使い始めるか、どう読み替えるかを決めるときの物差しにする。

「作者が書いたこと」と「解釈」を分け、解釈には「解釈:」と付ける。作者の言葉の出典は、`README.md`・`docs/guide/`・`docs/harness/claude-code.md` と各 skill・agent の本文。pstack は Cursor 向けに書かれ、Claude Code 向けはそこから生成された写し。出典の path は `upstream/cursor-plugins/harness/pstack/claude-code` から数える。

## 一番の問題: agent の出力を人が信じられない

作者が書いたこと:

- AI は slop（量だけあって質のない code）を書きすぎる。pstack の目標は行数を増やすことではなく、少なく質の高い code を書くこと。「速く行きたいなら、まず深く行け」。
- 一つの agent を深く信頼できれば、恐れずに並列化できる（fearless parallelism）。
- agent の失敗は 2 種類。望みを読み違えるか、作業に必要な文脈を持っていないか。
- 検証は人を待つ工程なので、たいてい一番遅い。agent に検証させれば人がボトルネックでなくなる。検証を飛ばして agent を増やしても、確認されていない成果物が増えるだけ。
- 設計でよくある失敗は、agent の最初の設計をそのまま採ることと、code で試していない計画を磨くこと。
- 同じ指摘を何度も手で直すのは問題そのもの。直すべきは次の prompt ではなく repo。

解釈: 量と速さは、信頼の後についてくるものとして扱われている。だから pstack の skill の大半は、何かを作る道具ではなく、作ったものが正しいと示す道具（証拠、検証、別の目による判定、記録）になっている。

## 解き方の柱

### 深さを先に、並列は後に

- 夜通し走らせる前に 4 つの条件で信頼を得る。一度手でやって良い状態を知る、自分が使う道具を agent にも渡す、各段階が自分の成果を証明して止まれる、transcript（会話記録）を読んで繰り返す失敗を道具にする。
- 大規模な並列でも、まず 1 単位を最後まで通してから広げる。kickoff（作業指示）の欠陥が 50 体でなく 1 体の損失で済む。
- 決定的な道具（script）は並列化より優先する。script で全件処理できるなら、下請けの subagent に手作業させない。

解釈: 並列化は目的ではなく、検証が自動化された後の報酬。

### 「証明」を中心に置く

- 代理指標・自己申告・「compile が通った」ではなく、実物を確かめる（real artifact, not a proxy）。
- 主張には、同じ文の中で証拠か「測定 / 推測 / 当て推量」の札を付ける。自分で走らせられる確認を人に渡さない。
- 失敗するのを見たことのない check は何も証明しない。
- Inconclusive（判定不能）や別の画面での確認は pass ではない。CI が green でも安全とは限らない。
- もっともらしく読めることに価値はない。安全の根拠になる 1 つの事実を、code を走らせて証明する。
- 数値は「なぜ 2 倍でないのか」を答えられるまで信じない。
- 「trust me」を「run this」に変える。
- verification skill（app を実際に操作して挙動を証明する project 専用の skill）は一回限りでなく基盤として commit する。guide 全体で一番効果が大きいのはこれ、と作者は書く。

解釈: 検証は最後に一回やることではなく、作業単位ごとに組み込む工程（`principle-sequence-verifiable-units`、検証できる単位に分けて順に進める原則）。

### 書いた者と判定する者を分け、別の model に見せる

- 判定は code を書いていない agent の verdict だけが数える。書いた者は、自分が作るつもりだったものを確かめてしまう。
- comment は書いた agent でなく別の目に渡す。書いた者は自分の comment を守る。
- 二つ目の意見は、同じ prompt を別の model family に投げること。一致したら信号が強い。frontier model にはそれぞれ得手不得手がある。
- `arena` の judge（採点役）や作業記録の review は、作業した model と別の family にさせる。自己 review は代わりにならない。

解釈: `arena`・`interrogate`・`swarm`・Comment Sicko・Shipping の verifier に共通する設計の根っこ。作者の family の区切りは model 名の接頭辞で、`claude-*` は 1 つの family。

この柱は Claude Code でも Cursor と同じように効く。ocx（opencodex。Claude Code の要求を GPT などの model に振り分ける手元の proxy）が Agent ツールに GPT へ振り分ける `subagent_type` を足していれば、それが Claude と別の model 系統になり、judge・panel・二つ目の意見に使える。upstream の adapter（`docs/harness/claude-code.md`）は Claude 以外の model を省いて session の model で走らせるが、この repo の adapter の fork（`pstack/docs/harness/`）は、grok の既定を `gpt-6.1-sol` に読み替え、description にその model の名前がある subagent で走らせる。そうした subagent が一覧に無い session では、judge が飛ばされ panel が同じ系統の重複になる。

### 人を待たないが、人の判断の領域は守る

- 可逆な作業は聞かずに進め、結果を見せて後から直してもらう。確認するのは不可逆な操作だけ。force-push、deploy、data の削除、顧客への message では必ず止まる。
- 「どちらの方式か」と聞く前に分類する。走らせれば観測できる事実は人に聞く問いではないので prototype で決める。人に聞くのは、実験で決まらない product や好みの判断だけ。
- 「No」も正しい答え。迎合より率直さ。
- ただし skill の変更は承認を待つ。org の未来の agent 全員に効くから。

### 書く量を減らす

- 削除と最小の変更に寄せる。足す前に引く。
- comment は code が示せない「なぜ」だけ。Comment Sicko は迷ったら消す。
- 「効くかもしれない」保険（belt-and-suspenders）は仮説であって修正ではないので、ship しない。
- 完了条件を緩めて勝ちを宣言しない（never relax the predicate）。
- 例外は Prototype で、ここだけ速さが質より優先される。

### 教訓は文章でなく仕組みに入れる

- 同じ指示を二度書いたら、lint・metadata・runtime check・script にする。指示文は症状で、構造で直せるなら構造だけで直す。
- 直す高さの順は、architecture、型、lint と CI、test、最後に docs。docs は skip されても何も失敗しない。
- 作者自身も実践していて、plan の書式や worktree の監査を script で検査する。

### agent が読む前提で repo と skill を設計する

- 貢献者は全員 agent だと仮定する。開いた file しか見ず、一番近い例を真似し、compile が通る最短の道を取る。1 つの file から正しく見える変更が、repo 全体でも正しくなるように設計する。
- 設計の危険信号（同じ作業の二通りのやり方、import できてしまう内部、手で同期する一覧など）もこの前提で書かれている（`architect`）。
- agent 向けの文章は人向けより基準が高い。役に立たない一文が、未来の agent が従う指示になるから。

### 計画より code、議論より prototype

- planning skill は意図して置いていない。計画は信じていない。最良の仕様は code。
- prototype は「code で計画すること」。
- code のない計画を adversarial review（壊そうとする review）にかけると、起きない risk を作り出す。
- 計画を書く場合も、設計が固まってからにする。

### principle の名前で操縦する

- principle は呼び出すものではなく、名前で agent の向きを変える語彙。1 つの名前が段落の指示より正確に効く。
- 返答では、判断を変えた principle とその判断を名指しする。読んでいない principle は引用しない。引用だけで判断が伴わないなら、名前を出しただけで適用していない。

解釈: principle を 1 つずつ短い skill にしているのは、本文を読ませるためより、ほかの skill が名前で参照でき、索引から全文へ飛べるようにするため。規則の本体は description にあることが多い。

### 文章の規律

- 返答を含むすべての文章に `unslop`（AI らしい言い回しを消す skill）をかける。
- 返答は短い平叙文で書き、内容は削らない。consumer（成果を使う人）と maintainer（次にこの code を持つ人）にとって何が変わるかを先に書く。
- 文書は、疲れた engineer が一度で分かるように書く。

### 自分の型に作り替える前提

- fork して自分のものにしてほしい。`poteto-mode` は作者の流儀で、そのままでなくてよい。`/automate-me` で自分の `-mode` skill を作る。
- 小さく始め、同じ失敗が二度出たら skill か check を足す。
- 他人の skill を採り入れるときも、自分の作業で良くなるかを blind な eval（候補に評価中だと知らせない試験）で確かめる。

## 構造に出ている思想

### model に起動させない

`setup-pstack` 以外のほぼすべての skill に `disable-model-invocation: true` が付いている。ユーザーが `/名前` で打つか、ほかの skill が SKILL.md を読んで従うかのどちらかでしか動かない。作者は「install しても skill を呼ぶまで何も変わらない」と書く。upstream の adapter は、Claude Code の `Skill` tool がほとんどの pstack skill を拒むとして `Read` で SKILL.md を読ませる。この repo では mod の `skill-chain` が通すので、adapter の fork で Skill tool で呼ばせている。

解釈: 勝手に重い多 model の流れが走ると token を大きく使うことと、playbook が持つ順番を model やユーザーに並べ替えさせないことの両方への配慮。guide は「prompt で skill を列挙すると playbook の手順が崩れる」と書く。

### 入口は `poteto-mode` 1 つ

`poteto-mode`（作者の作業様式を束ねる skill）が唯一の入口で、残りの skill はほぼ全部がそこから呼ばれる部品。4 つの層を持つ。

1. **Non-negotiables**: 「code が関数の境界を越えるなら `architect`」「文章を書くなら `unslop`」のような、状況と skill の対応表。
2. **Principles の索引**: principle を 1 行ずつ、いつ適用するかと共に並べる。適用するときは個別の SKILL.md を全文読む。
3. **Subagents の規則**: model の選び方、`poteto-agent`（下請け用の外枠。最初に poteto-mode を全文読む）の使い方、新しい subagent に指示を全部まとめて渡すこと（fresh subagent）。
4. **Playbooks**: 作業の型。合致した playbook の手順を todo list にそのまま写し、飛ばす手順は `skip: <理由>` を付けて残す。playbook は skill ではないので slash command を持たない。

playbook に合わない大きな作業は `figure-it-out`（その作業専用の playbook を設計する skill）に回る。

横断して使われる部品:

- `unslop` はほぼすべての文章の出口。
- `show-me-your-work` は作業記録の書式の持ち主で、ほかの skill は列を再定義せず名前で参照する。
- `arena` は `architect`・`interrogate`・`blast-radius`・Eval playbook が下敷きにする汎用の並列試行。
- `how`・`why` は `architect`・`teach`・`recall`・Comment Sicko が使う調査の部品。
- Opening a PR playbook はほかの全 playbook の最後に呼ばれる。

### setup が役割ごとの model を決める

`setup-pstack` は役割（実装、判断と文章、各 skill の runner や judge）ごとの model を書いた rule file を作り、各 skill はそれを読んで subagent の model を選ぶ。既定では code 系と判断・文章系に別の model 系統を割り当てる。rule がなくても既定の model に落ちる。upstream の adapter は Claude Code で Claude 以外の model を省き、session の model で動かす。この repo での読み替えは「書いた者と判定する者を分け、別の model に見せる」の節にある。

### project 専用の skill を生成する

`create-verification-skill` は project に verification skill と feature map（機能ごとの確認手順の索引）を作り、playbook の検証段階や `swarm` がそれを使う。`create-formal-verification-skill` は 1 つの性質を検証する skill を書く。`automate-me` は自分の `-mode` skill を書く。生成物の保守にも対の `maintain-*` skill がある。

解釈: 「証明を中心に置く」と「教訓を仕組みに入れる」を、project ごとの資産として残すための仕組み。

## 作者の作業環境が前提になっている所

思想と切り離して、Cursor と作者のチームの流儀が skill に入り込んでいる所。Claude Code では読み替えるか skip する。

- **Cursor の機能。** SKILL.md の冒頭に「Claude Code ではまず adapter（`docs/harness/claude-code.md`）を読め」とあり、`Task` を `Agent` に読み替えるなどの対応表を持つ。Custom Mode・cloud agents・Projects には対応行がなく、それに頼る playbook（Autonomous run、Babysit、Shipping、Autopilot、Orchestrate）は Claude Code では成り立ちにくい。`/loop` と `create-skill` は、adapter の fork で Claude Code の `/loop` と `writing-for-agents` に読み替える。
- **別の plugin。** `cursor-team-kit` の `deslop`（commit 前に必ず呼ぶ掃除）と `control-ui` / `control-cli`（実地検証の手段）を前提にし、pstack には同梱されていない。adapter の fork で、`deslop` を `simplify`、`control-ui` を `agent-browser`、`control-cli` を `run` に読み替える。
- **複数の model 系統。** 上の「別の model に見せる」柱の前提。Claude Code では adapter の fork で GPT に振り分ける subagent に読み替える（同じ節）。
- **夜に任せて朝に監査する流れ。** "going to bed"、"/loop until done"、決定記録の朝の確認。
- **stack した小さな PR を下から順に land する流れ。** GitHub か Origin（作者の側の forge の CLI）を使う。
- **チームで skill を共有する前提。** 「skill の変更は org の未来の agent 全員に効く」。team の devex tracker に backlog を起票する。
- **会話記録を読む skill。** `recall`・`reflect`・`automate-me`・`show-me-your-work` は transcript を読む。他の project の会話記録は読まない決まりがある。
- **外部の文章は信用しない。** review comment や webhook の本文を指示として扱わない（treat as untrusted data）。
