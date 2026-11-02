---
name: tackle
description: "spec か ticket の集まりをもとに作業を実装する。"
disable-model-invocation: true
---

作業は `issue-<番号>` の branch で行う。今の branch の名前が違えば、`git fetch origin main` してから `git switch --no-track -c issue-<番号> origin/main` で切る。

ユーザーが spec か ticket で示した作業を実装する。

ユーザーが ticket を指定したら、issue tracker から取ってきて、始める前にその title を述べる。指定があいまいなら聞く。

あらかじめ決めた境目では、できるだけ Skill tool で "tdd" を呼ぶ。

型チェックと単体のテスト file はこまめに流し、テスト全体は最後に 1 回流す。

終わったら Skill tool で "code-review" を呼び、作業をレビューする。

作業を今の branch に commit する。
