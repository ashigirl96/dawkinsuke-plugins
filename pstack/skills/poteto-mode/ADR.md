---
upstream: plugins/pstack/skills/poteto-mode
own: []
---

# poteto-mode の fork

## subagent を dawkinsuke の名前空間で呼ぶ

upstream は playbook の中で立てる subagent を `pstack:poteto-agent` と plugin 名付きで指定する。`dawkinsuke:poteto-agent` に変えた。plugin の agent は plugin 名の名前空間で登録され、dawkinsuke に取り込むと `pstack:` の名前は存在しないため。

## tdd を pstack-tdd として呼ぶ

upstream の `playbooks/bug-fix.md` は、テストを先に書く流れを **tdd** スキルに任せる。**pstack-tdd** に変えた。matt の `tdd` と名前が重なるので pstack の `tdd` を `pstack-tdd` に改名しており、`tdd` のままでは matt のスキルが呼ばれるため。

## PR 本文を pull-request で書く

upstream は PR 本文を `## Why` から `## Verification` までの 6 つの見出しで 40 行以内に書かせ、`SKILL.md` は本文を目的から始めさせる。`playbooks/opening-a-pr.md` と `worker.md` では本文を Skill tool で `pull-request` を呼んで書かせ、`SKILL.md` の目的から始める対象から PR を外した。matt の `pull-request` は Summary を図や diff の形で見せ、変更が一目でわかるため。
