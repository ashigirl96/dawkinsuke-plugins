# dawkinsuke-plugins

自分専用の Claude Code プラグイン `dawkinsuke` と、それを配る marketplace を兼ねた repo。repo のルートがそのままプラグインのルートになる（`.claude-plugin/marketplace.json` の `source` が `"./"`）。

検査は `sh scripts/check.sh` にまとめてあり、`.githooks/pre-commit` が commit のたびに流す。`scripts/` か `skills/<name>/scripts/` を変えた commit では `scripts/*.test.sh` も流す。clone したら `git config core.hooksPath .githooks` で hook を有効にする。

## upstream

upstream は 2 つの submodule。

- `upstream/mattpocock-skills`: https://github.com/mattpocock/skills 。使っているタグは `v1.3.2`。`skills/engineering/` と `skills/productivity/` のスキルを使う。
- `upstream/cursor-plugins`: https://github.com/cursor/plugins 。タグがないので、pstack の `.claude-plugin/plugin.json` の `version` を上げた commit で止める。使っている版: `0.15.36`（commit `c742dd6`）。`harness/pstack/claude-code/skills/` のスキルを使う。

matt のスキルは `matt/skills/<name>` から、pstack のスキルは `pstack/skills/<name>` から symlink で参照する。pstack のスキルは `../../docs/` や `../../README.md` を読むので、`pstack/` に upstream と同じ並びで `README.md` と `docs/guide` の symlink を置き、`plugin.json` の `skills` で `matt/skills` と `pstack/skills` を足している。Claude Code 向けの読み替えは、fork した adapter（`pstack/docs/harness/claude-code.md`）にすべて置く。adapter は実行中に読ませず、adapter を読ませる pstack のスキルは fork して、本文を adapter の節に従って最初から Claude Code の名前で書く。fork の書き方は `docs/fork.md` の「adapter を読ませるスキルの fork」にある（`docs/adr/0005-fork-adapter-readers.md`）。pstack の subagent（`poteto-agent`・`comment-sicko`）は、ルートの `agents` の symlink から読み込む。Claude Code が plugin のルートの `agents/` を既定で読み込むため。`agents` と `pstack/docs/guide` の symlink は `scripts/sync-skills.sh` の管理外なので、upstream で場所が変わったら手で張り直す。使わないスキルは `upstream/exclude.txt` に `<submodule>/<name>` の形で書く。2 つの upstream に同じ名前のスキル（`tdd`、`teach`）があるため、名前だけでは書かない。どちらも除外していなければ matt 側が使われ、script が `conflict` を出す。スキルの種類・置き場・key・呼ばれる名前・除外中かは、スキル台帳 `scripts/ledger.sh` だけが答え、他の script と手順書はそれを引く（`docs/adr/0006-skill-ledger-desired-state.md`）。symlink は `scripts/sync-skills.sh` が台帳に合わせるので、手では張らない。除外リストを書き換えたら、この script を流す。upstream のスキルを別の名前で使うときは、`upstream/rename.txt` に `<submodule>/<name> <新しい名前>` の形で書き、同じく script を流す。スキルの識別名（`dawkinsuke:<name>`）は symlink の名前で、補完に出る名前は `SKILL.md` の `name` で決まるので、改名リストに書いたうえで、`name` を新しい名前にする fork を新しい名前の置き場に作る。今は matt の `pr` を、`/pr` で始まる他のスキルと補完で紛れないよう `pull-request` にしている（`matt/skills/pull-request`）。同期のあとは `/verify-dawkinsuke` で、入れたスキルが依存するスキルや文書が抜けていないかを確かめる。除外中のスキルを使い始めるときは `/add-upstream-skill <name>` を使う。

upstream を上げるときは `/update-upstream-skill matt` か `/update-upstream-skill pstack` を使う。submodule だけを手で checkout し直すと、fork したスキルが古い upstream のまま残る。

## スキルの 3 種類

置き場所で種類が決まる。

- **symlink**: `matt/skills/<name>` か `pstack/skills/<name>` の symlink。upstream のスキルをそのまま使う。
- **fork**: `matt/skills/<name>` か `pstack/skills/<name>` の、`ADR.md` を持つ実ディレクトリ。upstream のスキルを自分の意図で変えたもの。
- **自作**: `skills/<name>` の実ディレクトリ。upstream と関係がない。

スキルを fork するとき、fork したスキルを変えるときは、`/fork-upstream-skill` を使う。fork の中身を `ADR.md` を通さずに直すと、次に upstream を上げたときにその変更が消える。fork の仕組みは `docs/fork.md` にある。

fork の本文で別のスキルを使わせるときは、「Skill tool で `<name>` を呼ぶ」とだけ書く。pstack の本文が SKILL.md を Read させている箇所も、fork ではこの書き方に置き換える。呼ぶ先が手動専用（`disable-model-invocation: true`）でスキル一覧に無くても、この plugin の置き場所（`skills/`・`matt/skills`・`pstack/skills`）のどれかにあれば、mod の `skill-chain` が呼ばせて通す。仕組みは `mods/skill-chain/README.md` にある。

新しいスキルを足す前に `/vet-skill` を使う。matt と pstack の思想（`docs/philosophy/`）に合うか、既存のスキル・除外中の upstream スキル・fork で足りないかを評価する。

matt と pstack について聞かれたら、`docs/philosophy/` で当たりを付け、止めている版の submodule の原文を読み、`path:line` で引いて答える。原文の場所は各要約の冒頭にある。そのスキルが fork なら `ADR.md` の決定を、除外中ならそのことも添える。

## mod

Claude Code の mod（hooks module で engine の挙動や描画を変える部品）は、1 つを 1 つの plugin として `mods/<name>/` に置き、`marketplace.json` に `"source": "./mods/<name>"` で並べる。engine は 1 つの plugin に hooks module を 1 つしか許さず、同じ event に matcher のない hook を 2 度掛けることも許さないので、mod を `dawkinsuke` にまとめない。

folder の marketplace の相対 path の plugin は checkout から直接読まれるので、mod の script が使う依存はルートの `package.json` に書き、clone したら `bun install` で入れる。mod を足したら、`claude plugin install <name>@dawkinsuke` で入れる。mod を本物の Claude Code の画面で確かめるときは `/verify-mods` を使い、mod を足したらその `features/` に手順を足す。

mod の engine の振る舞いのうち、型定義と plugin-authoring の手引きに無く実機で確かめたものは `docs/research/claude-code-mod-engine.md` にある。mod を書く前に読み、新しく確かめた事実はそこに足す。

## Agent skills

### Issue tracker

issue は GitHub Issues（`ashigirl96/dawkinsuke-plugins`）で管理し、`gh` CLI で操作する。See `docs/agents/issue-tracker.md`.

### Triage labels

既定の 5 つのラベル（`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`）をそのまま使う。See `docs/agents/triage-labels.md`.

### Domain docs

single-context。ルートの `GLOSSARY.md` 1 つと `docs/adr/` を使う。See `docs/agents/domain.md`.
