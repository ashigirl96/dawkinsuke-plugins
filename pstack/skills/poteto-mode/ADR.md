---
upstream: plugins/pstack/skills/poteto-mode
own: []
---

# poteto-mode の fork

## subagent を dawkinsuke の名前空間で呼ぶ

upstream は playbook の中で立てる subagent を `pstack:poteto-agent` と plugin 名付きで指定する。`dawkinsuke:poteto-agent` に変えた。plugin の agent は plugin 名の名前空間で登録され、dawkinsuke に取り込むと `pstack:` の名前は存在しないため。

## tdd を pstack-tdd として呼ぶ

upstream の `playbooks/bug-fix.md` は、テストを先に書く流れを **tdd** スキルに任せる。**pstack-tdd** に変えた。matt の `tdd` と名前が重なるので pstack の `tdd` を `pstack-tdd` に改名しており、`tdd` のままでは matt のスキルが呼ばれるため。
