# dawkinsuke-plugins

自分専用の Claude Code プラグイン `dawkinsuke` と、それを配る marketplace を兼ねた repo。repo のルートがそのままプラグインのルートになる（`.claude-plugin/marketplace.json` の `source` が `"./"`）。

検査は `sh scripts/check.sh` にまとめてあり、`.githooks/pre-commit` が commit のたびに流す。`scripts/` を変えた commit では `scripts/*.test.sh` も流す。clone したら `git config core.hooksPath .githooks` で hook を有効にする。

## upstream

upstream は 2 つの submodule。

- `upstream/mattpocock-skills`: https://github.com/mattpocock/skills 。使っているタグは `v1.3.2`。`skills/engineering/` と `skills/productivity/` のスキルを使う。
- `upstream/cursor-plugins`: https://github.com/cursor/plugins 。タグがないので、pstack の `.claude-plugin/plugin.json` の `version` を上げた commit で止める。使っている版: `0.15.36`（commit `c742dd6`）。`harness/pstack/claude-code/skills/` のスキルを使う。

matt のスキルは `matt/skills/<name>` から、pstack のスキルは `pstack/skills/<name>` から symlink で参照する。pstack のスキルは `../../docs/` や `../../README.md` を読むので、`pstack/` に upstream と同じ並びで `docs` と `README.md` の symlink を置き、`plugin.json` の `skills` で `matt/skills` と `pstack/skills` を足している。使わないスキルは `upstream/exclude.txt` に `<submodule>/<name>` の形で書く。2 つの upstream に同じ名前のスキル（`tdd`、`teach`）があるため、名前だけでは書かない。どちらも除外していなければ matt 側が使われ、script が `conflict` を出す。symlink は `scripts/sync-skills.sh` が upstream と除外リストに合わせるので、手では張らない。除外リストを書き換えたら、この script を流す。同期のあとは `/verify-dawkinsuke` で、入れたスキルが依存するスキルや文書が抜けていないかを確かめる。

タグを上げるときは `/update-matt-skill` を使う。submodule だけを手で checkout し直すと、fork したスキルが古い upstream のまま残る。

## スキルの 3 種類

置き場所で種類が決まる。

- **symlink**: `matt/skills/<name>` の symlink。matt のスキルをそのまま使う。
- **fork**: `matt/skills/<name>` の、`ADR.md` を持つ実ディレクトリ。matt のスキルを自分の意図で変えたもの。
- **自作**: `skills/<name>` の実ディレクトリ。upstream と関係がない。

matt のスキルを fork するとき、fork したスキルを変えるときは、`/edit-matt-skill` を使う。fork の中身を `ADR.md` を通さずに直すと、次の `/update-matt-skill` でその変更が消える。fork の仕組みは `docs/fork.md` にある。

## Agent skills

### Issue tracker

issue は GitHub Issues（`ashigirl96/dawkinsuke-plugins`）で管理し、`gh` CLI で操作する。See `docs/agents/issue-tracker.md`.

### Triage labels

既定の 5 つのラベル（`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`）をそのまま使う。See `docs/agents/triage-labels.md`.

### Domain docs

single-context。ルートの `GLOSSARY.md` 1 つと `docs/adr/` を使う。See `docs/agents/domain.md`.
