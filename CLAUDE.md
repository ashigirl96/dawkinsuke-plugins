# dawkinsuke-plugins

自分専用の Claude Code プラグイン `dawkinsuke` と、それを配る marketplace を兼ねた repo。repo のルートがそのままプラグインのルートになる（`.claude-plugin/marketplace.json` の `source` が `"./"`）。manifest を触ったら `claude plugin validate .` を流す。

## upstream

`upstream/mattpocock-skills` は https://github.com/mattpocock/skills の submodule。

- 使っているタグ: `v1.3.2`

`skills/engineering/` と `skills/productivity/` の各スキルを、`skills/<name>` から symlink で参照する。使わないスキルは `upstream/exclude.txt` に書く。symlink は `scripts/sync-skills.sh` が upstream と除外リストに合わせるので、手では張らない。除外リストを書き換えたら、この script を流す。script を直したら `sh scripts/sync-skills.test.sh` を流す。

タグを上げるときは `/update-matt-skill` を使う。submodule だけを手で checkout し直すと、fork したスキルが古い upstream のまま残る。

## skills/ の 3 種類

`skills/<name>` は次のどれか 1 つ。

- **symlink**: matt のスキルをそのまま使う。
- **fork**: `ADR.md` を持つ実ディレクトリ。matt のスキルを自分の意図で変えたもの。
- **自作**: `ADR.md` を持たない実ディレクトリ。upstream と関係がない。

matt のスキルを fork するとき、fork したスキルを変えるときは、`/edit-matt-skill` を使う。fork の中身を `ADR.md` を通さずに直すと、次の `/update-matt-skill` でその変更が消える。fork の仕組みは `docs/fork.md` にある。

## Agent skills

### Issue tracker

issue は GitHub Issues（`ashigirl96/dawkinsuke-plugins`）で管理し、`gh` CLI で操作する。See `docs/agents/issue-tracker.md`.

### Triage labels

既定の 5 つのラベル（`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`）をそのまま使う。See `docs/agents/triage-labels.md`.

### Domain docs

single-context。ルートの `GLOSSARY.md` 1 つと `docs/adr/` を使う。See `docs/agents/domain.md`.
