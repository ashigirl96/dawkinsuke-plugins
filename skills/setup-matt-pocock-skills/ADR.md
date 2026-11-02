---
upstream: skills/engineering/setup-matt-pocock-skills
own: []
---

# setup-matt-pocock-skills の fork

## implement を写した tackle スキルを repo に置く

matt は issue tracker・triage label・domain doc の設定だけを repo に書く。setup のときに `implement` の `SKILL.md` を repo の `.claude/skills/tackle/SKILL.md` へ写し、すでにあれば手を付けないように変えた。実装の進め方は org ごとに変わり（`code-review` の代わりに PR に付いた Codex の review に応える、など）、プラグイン側では管理できないため。

## tackle の冒頭で issue の branch を切らせる

matt の `implement` は今の branch にそのまま commit させる。tackle を写すときに本文の冒頭へ、`issue-<番号>` の branch でなければ `origin/main` から `--no-track` で切る段落を足すように変えた。issue ごとに PR を分け、最新の main から作業を始めるため。

## repo に書くものを日本語にする

matt は英語の雛形と `implement` をそのまま repo に書く。`## Agent skills` の節の中身、`docs/agents/*.md`、tackle の description と本文を、日本語に訳して書くように変えた。どれも repo ごとに手で直すファイルなので、読み書きしやすい言葉にしておくため。
